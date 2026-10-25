"""Private durable job store. Only JSON on stdin/stdout; never logs content or credentials."""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
import time
import uuid
from pathlib import Path

TTL = 7 * 86400
ACTIVE = ('queued', 'running', 'preparing')


class StoreError(Exception):
    def __init__(self, code, message, status=400):
        self.code, self.message, self.status = code, message, status
        super().__init__(code)


def data_dir():
    configured = os.environ.get('HANDWRITING_DATA_DIR')
    if not configured and os.environ.get('NODE_ENV') == 'production':
        raise StoreError('NOT_CONFIGURED', '手写任务存储尚未配置。', 503)
    path = Path(configured or Path(__file__).resolve().parents[2] / '.tmp/handwriting').resolve()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def connect():
    os.umask(0o077)
    db = sqlite3.connect(data_dir() / 'jobs.sqlite3', timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    for attempt in range(20):
        try:
            if db.execute('PRAGMA journal_mode').fetchone()[0] != 'wal':
                db.execute('PRAGMA journal_mode=WAL')
            break
        except sqlite3.OperationalError:
            if attempt == 19:
                raise
            time.sleep(0.05)
    db.execute('PRAGMA synchronous=FULL')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, digest TEXT NOT NULL, request_id TEXT NOT NULL,
        status TEXT NOT NULL, created REAL NOT NULL, expires REAL NOT NULL, updated REAL NOT NULL,
        payload TEXT NOT NULL, upstream TEXT, error TEXT, pages TEXT NOT NULL DEFAULT '[]',
        lease TEXT, lease_until REAL NOT NULL DEFAULT 0, next_run REAL NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS requests (
        owner TEXT NOT NULL, request_id TEXT NOT NULL, job_id TEXT NOT NULL, digest TEXT NOT NULL,
        PRIMARY KEY(owner, request_id));
      CREATE TABLE IF NOT EXISTS worker (id INTEGER PRIMARY KEY CHECK(id=1), heartbeat REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS revoked_requests (
        owner TEXT NOT NULL, request_id TEXT NOT NULL, created REAL NOT NULL, PRIMARY KEY(owner, request_id));
      CREATE INDEX IF NOT EXISTS queue ON jobs(status, next_run, lease_until);
    ''')
    return db


def public(row):
    status = row['status'] if row['expires'] > time.time() else 'expired'
    pages = json.loads(row['pages']) if status == 'ready' and not row['deleted'] else []
    return {'id': row['id'], 'requestId': row['request_id'], 'contentDigest': row['digest'],
            'status': status, 'createdAt': int(row['created'] * 1000), 'expiresAt': int(row['expires'] * 1000),
            'pages': pages, 'pagesDone': len(pages), 'retryPreparation': can_resume(row),
            **({'error': json.loads(row['error'])} if row['error'] else {})}


def can_resume(row):
    upstream = json.loads(row['upstream'] or '{}')
    error = json.loads(row['error'] or '{}')
    return row['status'] == 'failed' and bool(upstream.get('id')) and error.get('code') not in ('GENERATION_FAILED', 'FILES_EXPIRED') and row['expires'] > time.time() and not row['deleted']


def owned(db, owner, job_id=None, request_id=None):
    if request_id:
        row = db.execute('SELECT j.* FROM jobs j JOIN requests r ON j.id=r.job_id WHERE r.owner=? AND r.request_id=?',
                         (owner, request_id)).fetchone()
    else:
        row = db.execute('SELECT * FROM jobs WHERE owner=? AND id=?', (owner, job_id)).fetchone()
    if not row or row['deleted']:
        raise StoreError('NOT_FOUND', '找不到这份纪念卡，请回到原草稿。', 404)
    return row


def create(db, args):
    now = time.time()
    owner, request_id, digest = args['owner'], args['requestId'], args['contentDigest']
    db.execute('BEGIN IMMEDIATE')
    try:
        if db.execute('SELECT 1 FROM revoked_requests WHERE owner=? AND request_id=?', (owner, request_id)).fetchone():
            raise StoreError('REQUEST_REVOKED', '这份草稿已被清理，请从原文重新建立草稿。', 410)
        prior = db.execute('SELECT * FROM requests WHERE owner=? AND request_id=?', (owner, request_id)).fetchone()
        if prior:
            if prior['digest'] != digest:
                raise StoreError('IDEMPOTENCY_CONFLICT', '这次发送的文字已变化，请重新确认草稿。', 409)
            result = public(owned(db, owner, prior['job_id']))
        else:
            if db.execute('SELECT count(*) FROM requests WHERE owner=?', (owner,)).fetchone()[0] >= 200:
                raise StoreError('QUEUE_FULL', '这台设备的导出请求较多，请清理记录后稍后再试。', 429)
            row = db.execute('SELECT * FROM jobs WHERE owner=? AND digest=? ORDER BY created DESC LIMIT 1', (owner, digest)).fetchone()
            if row and can_resume(row):
                active = db.execute("SELECT count(*) FROM jobs WHERE owner=? AND status IN ('queued','running','preparing') AND deleted=0 AND expires>?", (owner, now)).fetchone()[0]
                total = db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running','preparing') AND expires>?", (now,)).fetchone()[0]
                if active or total >= 40:
                    raise StoreError('QUEUE_FULL', '请先完成或取消上一份纪念卡。', 429)
                db.execute("UPDATE jobs SET status='preparing',error=NULL,next_run=0,updated=? WHERE id=?", (now, row['id']))
                result = public(owned(db, owner, row['id']))
            elif row and row['status'] in ACTIVE + ('ready',) and not row['deleted'] and row['expires'] > now:
                result = public(row)
            else:
                count = db.execute("SELECT count(*) FROM jobs WHERE owner=? AND status IN ('queued','running','preparing') AND deleted=0 AND expires>?", (owner, now)).fetchone()[0]
                total = db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running','preparing') AND expires>?", (now,)).fetchone()[0]
                recent = db.execute('SELECT count(*) FROM jobs WHERE owner=? AND created>?', (owner, now - 86400)).fetchone()[0]
                if count >= 1 or total >= 40 or recent >= 20:
                    raise StoreError('QUEUE_FULL', '请先完成或取消上一份纪念卡，稍后再试。', 429)
                job_id = str(uuid.uuid4())
                db.execute('INSERT INTO jobs(id,owner,digest,request_id,status,created,expires,updated,payload) VALUES(?,?,?,?,?,?,?,?,?)',
                           (job_id, owner, digest, request_id, 'queued', now, now + TTL, now, json.dumps(args['content'], ensure_ascii=False)))
                result = public(owned(db, owner, job_id))
            db.execute('INSERT INTO requests VALUES(?,?,?,?)', (owner, request_id, result['id'], digest))
        db.execute('COMMIT')
        return result
    except Exception:
        db.execute('ROLLBACK')
        raise


def dispatch(db, command, args):
    if command == 'create':
        return create(db, args)
    if command == 'get':
        return public(owned(db, args['owner'], args.get('id'), args.get('requestId')))
    if command == 'retry':
        db.execute('BEGIN IMMEDIATE')
        try:
            row = owned(db, args['owner'], args['id'])
            if can_resume(row):
                active = db.execute("SELECT count(*) FROM jobs WHERE owner=? AND id<>? AND status IN ('queued','running','preparing') AND deleted=0 AND expires>?", (args['owner'], row['id'], time.time())).fetchone()[0]
                total = db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running','preparing') AND expires>?", (time.time(),)).fetchone()[0]
                if active or total >= 40:
                    raise StoreError('QUEUE_FULL', '请先完成或取消上一份纪念卡。', 429)
                db.execute("UPDATE jobs SET status='preparing',error=NULL,next_run=0,updated=? WHERE id=? AND status='failed' AND deleted=0", (time.time(), row['id']))
            result = public(owned(db, args['owner'], row['id']))
            db.execute('COMMIT')
            return result
        except Exception:
            db.execute('ROLLBACK')
            raise
    if command == 'revoke':
        db.execute('BEGIN IMMEDIATE')
        try:
            owner, request_id = args['owner'], args['requestId']
            db.execute('INSERT OR IGNORE INTO revoked_requests VALUES(?,?,?)', (owner, request_id, time.time()))
            row = db.execute('SELECT j.* FROM jobs j JOIN requests r ON j.id=r.job_id WHERE r.owner=? AND r.request_id=?', (owner, request_id)).fetchone()
            if row and not row['deleted']:
                dispatch(db, 'delete', {'owner': owner, 'id': row['id']})
            db.execute('COMMIT')
        except Exception:
            db.execute('ROLLBACK')
            raise
        return {'deleted': True}
    if command in ('cancel', 'delete'):
        row = owned(db, args['owner'], args['id'])
        # A cancel is terminal even if the upstream or renderer finishes later.
        status = 'cancelled' if row['status'] in ACTIVE else row['status']
        if command == 'delete':
            status = 'cancelled'
        db.execute('UPDATE jobs SET status=?, deleted=?, updated=?, next_run=0 WHERE owner=? AND id=?',
                   (status, int(command == 'delete'), time.time(), args['owner'], row['id']))
        if command == 'delete':
            # The worker also removes any file a concurrent render writes afterwards.
            shutil.rmtree(data_dir() / row['id'], ignore_errors=True)
            upstream = json.loads(row['upstream'] or '{}')
            upstream = {key: value for key, value in upstream.items() if key in ('id', 'key', 'cancelSynced')}
            db.execute("UPDATE jobs SET payload='{}', pages='[]', error=NULL, upstream=? WHERE id=?", (json.dumps(upstream), row['id']))
            return {'deleted': True}
        return public(owned(db, args['owner'], row['id']))
    if command == 'health':
        row = db.execute('SELECT heartbeat FROM worker WHERE id=1').fetchone()
        return {'workerReady': bool(row and row[0] > time.time() - 20)}
    if command == 'asset':
        row = owned(db, args['owner'], args['id'])
        if row['status'] != 'ready' or row['expires'] <= time.time():
            raise StoreError('NOT_READY', '这份纪念卡尚不可保存或已过期。', 409)
        names = [f"layer-{page['index']}.png" for page in json.loads(row['pages'])]
        if args['asset'] not in names:
            raise StoreError('NOT_FOUND', '找不到这份素材。', 404)
        path = data_dir() / row['id'] / args['asset']
        if not path.is_file() or path.is_symlink():
            raise StoreError('FILES_EXPIRED', '素材已清理，请重新制作。', 410)
        return {'path': str(path)}
    raise StoreError('INVALID_COMMAND', '无法执行这次操作。')


def main():
    try:
        raw = sys.stdin.buffer.read(256_001)
        if len(raw) > 256_000:
            raise StoreError('TOO_LARGE', '文字过长，请减少所选内容。', 413)
        args = json.loads(raw)
        with connect() as db:
            result = dispatch(db, sys.argv[1], args)
        print(json.dumps({'ok': True, 'value': result}, ensure_ascii=False))
    except StoreError as error:
        print(json.dumps({'ok': False, 'code': error.code, 'message': error.message, 'status': error.status}, ensure_ascii=False))
    except Exception:
        print(json.dumps({'ok': False, 'code': 'STORAGE_UNAVAILABLE', 'message': '手写任务暂不可用，草稿仍保存在本机。', 'status': 503}, ensure_ascii=False))


if __name__ == '__main__':
    main()
