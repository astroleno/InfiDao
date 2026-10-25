"""One persistent worker per data directory. SQLite leases plus an OS lock survive request/process restarts."""
from __future__ import annotations

import fcntl
import json
import os
import re
import shutil
import signal
import threading
import time
import uuid

from store import ACTIVE, connect, data_dir
from provider import Inko, ProviderError, download
from prepare import prepare

stop = threading.Event()
current = [None]


def patch(db, job_id, token, **values):
    columns = ','.join(f'{key}=?' for key in values)
    db.execute(f"UPDATE jobs SET {columns},updated=? WHERE id=? AND lease=? AND status IN ('queued','running','preparing') AND deleted=0",
               (*values.values(), time.time(), job_id, token))


def still_active(db, job_id):
    row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
    return row and row['status'] in ACTIVE and not row['deleted'] and row['expires'] > time.time()


def claim(db):
    now, token = time.time(), uuid.uuid4().hex
    db.execute('BEGIN IMMEDIATE')
    try:
        row = db.execute("SELECT * FROM jobs WHERE status IN ('queued','running','preparing') AND deleted=0 AND expires>? AND next_run<=? AND lease_until<? ORDER BY created LIMIT 1", (now, now, now)).fetchone()
        if row:
            db.execute('UPDATE jobs SET lease=?,lease_until=? WHERE id=?', (token, now + 60, row['id']))
        db.execute('COMMIT')
        return (row, token) if row else None
    except Exception:
        db.execute('ROLLBACK')
        raise


def sync_cancelled(db, provider):
    db.execute('DELETE FROM revoked_requests WHERE created<?', (time.time() - 8 * 86400,))
    for row in db.execute("SELECT * FROM jobs WHERE status IN ('cancelled','expired') OR expires<? OR deleted=1", (time.time(),)).fetchall():
        upstream = json.loads(row['upstream'] or '{}')
        upstream = {key: value for key, value in upstream.items() if key in ('id', 'key', 'cancelSynced')}
        if upstream.get('id') and not upstream.get('cancelSynced') and row['next_run'] < time.time():
            try:
                provider.call('POST', '/generations/' + upstream['id'] + '/cancel', {})
                upstream['cancelSynced'] = True
                db.execute('UPDATE jobs SET upstream=? WHERE id=?', (json.dumps(upstream), row['id']))
            except ProviderError:
                db.execute('UPDATE jobs SET next_run=? WHERE id=?', (time.time() + 60, row['id']))
        shutil.rmtree(data_dir() / row['id'], ignore_errors=True)
        # Keep only a bounded tombstone for uncertain request recovery; erase selected private text.
        db.execute("UPDATE jobs SET status=CASE WHEN expires<? THEN 'expired' ELSE status END,payload='{}',pages='[]',error=NULL,upstream=? WHERE id=?", (time.time(), json.dumps(upstream), row['id']))
        if row['expires'] < time.time() - 86400:
            db.execute('DELETE FROM requests WHERE job_id=?', (row['id'],))
            db.execute('DELETE FROM jobs WHERE id=?', (row['id'],))


def process(db, row, token, provider):
    job_id = row['id']
    content = json.loads(row['payload'])
    folder = data_dir() / job_id
    folder.mkdir(mode=0o700, exist_ok=True)
    upstream = json.loads(row['upstream'] or '{}')
    if not upstream.get('id'):
        if not upstream.get('body'):
            body, plan = provider.preflight(content)
            if not still_active(db, job_id):
                return
            upstream = {'body': body, 'plan': plan, 'key': 'infidao-' + job_id.replace('-', '')}
            patch(db, job_id, token, upstream=json.dumps(upstream, ensure_ascii=False))
        if not still_active(db, job_id):
            return
        generated = provider.call('POST', '/generations', upstream['body'], idempotency=upstream['key'])
        if not isinstance(generated.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', generated['id']):
            raise ProviderError('UPSTREAM_CHANGED', '无法核对上游任务编号，已保留原发送记录。', retry=True)
        upstream['id'] = generated['id']
        # Always retain the upstream ID, including a response racing a local cancel.
        db.execute('UPDATE jobs SET upstream=? WHERE id=? AND lease=?', (json.dumps(upstream, ensure_ascii=False), job_id, token))
    if not still_active(db, job_id):
        return
    job = provider.call('GET', '/generations/' + upstream['id'])
    status = job.get('status')
    if status in ('queued', 'running'):
        patch(db, job_id, token, status=status, next_run=time.time() + 3, error=None)
        return
    if status in ('failed', 'canceled', 'cancelled'):
        raise ProviderError('GENERATION_FAILED', '手写服务未完成这次制作，原草稿仍在。')
    if status != 'succeeded':
        raise ProviderError('UPSTREAM_CHANGED', '无法确认制作阶段，正在核对原任务。', retry=True)
    patch(db, job_id, token, status='preparing', error=None)
    files = job.get('files') or {}
    if files.get('expired'):
        raise ProviderError('FILES_EXPIRED', '上游素材已过期，请重新制作。')
    originals = files.get('pages')
    if not files.get('scene') or not files.get('pdf') or not isinstance(originals, list) or not 1 <= len(originals) <= 60:
        raise ProviderError('FILES_INCOMPLETE', '素材尚未齐全，稍后继续整理。', retry=True)
    downloads = [('scene.zip', files['scene']), ('upstream.pdf', files['pdf'])]
    for index, page in enumerate(originals):
        if not isinstance(page.get('png'), str):
            raise ProviderError('FILES_INCOMPLETE', '原图尚未齐全，稍后继续整理。', retry=True)
        downloads.append((f'upstream-{index}.png', page['png']))
    for name, url in downloads:
        if not still_active(db, job_id):
            return
        if not (folder / name).is_file():
            if sum(path.stat().st_size for path in folder.glob('*') if path.is_file()) > 512 * 1024 * 1024:
                raise ProviderError('ASSET_TOO_LARGE', '这份素材超过可处理的大小，已停止制作。')
            if shutil.disk_usage(folder).free < 768 * 1024 * 1024:
                raise ProviderError('STORAGE_FULL', '导出空间暂时不足，稍后继续整理。', retry=True)
            download(url, folder / name)
    (folder / 'generation.json').write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
    pages = prepare(folder, content)
    if len(pages) != len(originals):
        raise ProviderError('PAGE_MISMATCH', '素材页数不一致，已停止交付以保留完整文字。')
    if not still_active(db, job_id):
        return
    # Delivery-complete is deliberately optional: upstream copies retain their normal lifecycle.
    upstream['saved'] = True
    patch(db, job_id, token, status='ready', pages=json.dumps(pages, ensure_ascii=False), upstream=json.dumps(upstream, ensure_ascii=False), error=None)


def step(db, provider):
    sync_cancelled(db, provider)
    item = claim(db)
    if not item:
        return False
    row, token = item
    current[0] = (row['id'], token)
    try:
        process(db, row, token, provider)
    except ProviderError as error:
        detail = {'code': error.code, 'message': error.message}
        if error.positions is not None:
            detail['positions'] = error.positions
        patch(db, row['id'], token, **({'next_run': time.time() + min(60, 3 * 2 ** min(row['attempts'], 4)), 'attempts': row['attempts'] + 1}
              if error.retry else {'status': 'failed'}), error=json.dumps(detail, ensure_ascii=False))
    except Exception:
        patch(db, row['id'], token, status='failed', error=json.dumps({'code': 'PREPARATION_FAILED', 'message': '卡面整理未成功，原草稿仍在，请稍后重试。'}, ensure_ascii=False))
    finally:
        current[0] = None
        db.execute('UPDATE jobs SET lease=NULL,lease_until=0 WHERE id=? AND lease=?', (row['id'], token))
        if not still_active(db, row['id']):
            state = db.execute('SELECT status,deleted FROM jobs WHERE id=?', (row['id'],)).fetchone()
            if state and (state['status'] in ('cancelled', 'expired') or state['deleted']):
                shutil.rmtree(data_dir() / row['id'], ignore_errors=True)
    return True


def heartbeat():
    with connect() as db:
        while not stop.is_set():
            now = time.time()
            db.execute('INSERT INTO worker VALUES(1,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat', (now,))
            if item := current[0]:
                db.execute('UPDATE jobs SET lease_until=? WHERE id=? AND lease=?', (now + 60, *item))
            stop.wait(4)


def main():
    if not os.environ.get('INKO_API_KEY'):
        raise SystemExit('INKO_API_KEY is not configured')
    lock = (data_dir() / 'worker.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('A handwriting worker is already running for this data directory') from None
    lock.seek(0); lock.truncate(); lock.write(str(os.getpid())); lock.flush()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    provider = Inko(os.environ['INKO_API_KEY'])
    with connect() as db:
        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        print('Handwriting worker ready (zero-cost only)', flush=True)
        while not stop.is_set():
            step(db, provider)
            stop.wait(2)
        db.execute('DELETE FROM worker WHERE id=1')
    thread.join(timeout=5)


if __name__ == '__main__':
    main()
