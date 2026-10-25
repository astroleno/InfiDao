"""Offline acceptance checks: no API key or network required."""
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import provider
import store
import worker
from prepare import verify_text_coverage

CONTENT = {'text': '學而時習之，不亦說乎？\n\n論語', 'styleCode': '12', 'layout': 'cream',
           'blocks': [{'role': 'quote', 'start': 0, 'end': 12}, {'role': 'source', 'start': 14, 'end': 16}],
           'pen': {'type': 'original', 'color': 'black', 'weight': 0, 'ink': 0}}


class FakeInko:
    def __init__(self):
        self.created = []
        self.failed_once = False
        self.cancelled = []

    def preflight(self, content):
        return {'text': content['text']}, {'pages': 1, 'unplaced': 0, 'price': {'list_cents': 0}}

    def call(self, method, path, body=None, idempotency=None):
        if path == '/generations':
            self.created.append(idempotency)
            if not self.failed_once:
                self.failed_once = True
                raise provider.ProviderError('NETWORK', '核对中', retry=True)
            return {'id': 'upstream-job'}
        if path.endswith('/cancel'):
            self.cancelled.append(path)
            return {'status': 'canceled'}
        return {'status': 'running'}


class Jobs(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'HANDWRITING_DATA_DIR': self.directory.name})
        self.env.start()
        self.db = store.connect()

    def tearDown(self):
        self.db.close()
        self.env.stop()
        self.directory.cleanup()

    def create(self, request='request-a', digest='digest-a', owner='owner-a'):
        return store.create(self.db, {'owner': owner, 'requestId': request, 'contentDigest': digest, 'content': CONTENT})

    def test_idempotent_request_and_digest_cache_are_scoped(self):
        first = self.create()
        self.assertEqual(first['id'], self.create()['id'])
        self.assertEqual(first['id'], self.create(request='request-b')['id'])
        self.assertNotEqual(first['id'], self.create(owner='owner-b')['id'])
        with self.assertRaises(store.StoreError):
            self.create(digest='changed')

    def test_owner_cannot_read_cancel_or_get_assets_from_another_owner(self):
        first = self.create()
        for operation in ('get', 'cancel', 'asset', 'delete'):
            with self.assertRaises(store.StoreError):
                store.dispatch(self.db, operation, {'owner': 'other', 'id': first['id'], 'asset': '../jobs.sqlite3'})

    def test_request_recovery_survives_a_new_connection(self):
        first = self.create()
        self.db.close()
        self.db = store.connect()
        recovered = store.dispatch(self.db, 'get', {'owner': 'owner-a', 'requestId': 'request-a'})
        self.assertEqual(first['id'], recovered['id'])

    def test_clear_racing_an_unconfirmed_post_prevents_late_creation(self):
        store.dispatch(self.db, 'revoke', {'owner': 'owner-a', 'requestId': 'request-a'})
        with self.assertRaises(store.StoreError) as raised:
            self.create()
        self.assertEqual(raised.exception.code, 'REQUEST_REVOKED')
        self.assertEqual(self.db.execute('SELECT count(*) FROM jobs').fetchone()[0], 0)

    def test_revoke_is_scoped_to_the_issued_owner(self):
        first = self.create()
        store.dispatch(self.db, 'revoke', {'owner': 'other', 'requestId': 'request-a'})
        self.assertEqual(self.create()['id'], first['id'])
        store.dispatch(self.db, 'revoke', {'owner': 'owner-a', 'requestId': 'request-a'})
        with self.assertRaises(store.StoreError):
            store.dispatch(self.db, 'get', {'owner': 'owner-a', 'id': first['id']})

    def test_one_active_job_per_owner(self):
        self.create()
        with self.assertRaises(store.StoreError):
            self.create(request='next', digest='next')

    def test_uncertain_submit_reuses_the_identical_upstream_key(self):
        first = self.create()
        fake = FakeInko()
        worker.step(self.db, fake)
        self.db.execute('UPDATE jobs SET next_run=0')
        worker.step(self.db, fake)
        self.assertEqual(len(fake.created), 2)
        self.assertEqual(fake.created[0], fake.created[1])
        row = self.db.execute('SELECT * FROM jobs WHERE id=?', (first['id'],)).fetchone()
        self.assertEqual(row['status'], 'running')
        self.assertEqual(json.loads(row['upstream'])['id'], 'upstream-job')

    def test_cancel_is_idempotent_and_late_ready_write_is_fenced(self):
        first = self.create()
        row, token = worker.claim(self.db)
        store.dispatch(self.db, 'cancel', {'owner': 'owner-a', 'id': first['id']})
        store.dispatch(self.db, 'cancel', {'owner': 'owner-a', 'id': first['id']})
        worker.patch(self.db, row['id'], token, status='ready', pages='[{"index":0}]')
        result = store.dispatch(self.db, 'get', {'owner': 'owner-a', 'id': first['id']})
        self.assertEqual(result['status'], 'cancelled')
        self.assertEqual(result['pages'], [])

    def test_preparation_retry_retains_the_original_generation(self):
        first = self.create()
        self.db.execute("UPDATE jobs SET status='failed',upstream=?,error=? WHERE id=?", (json.dumps({'id': 'finished-cloud-job', 'key': 'stable-key'}), json.dumps({'code': 'DOWNLOAD_UNAVAILABLE'}), first['id']))
        result = store.dispatch(self.db, 'retry', {'owner': 'owner-a', 'id': first['id']})
        self.assertEqual(result['id'], first['id'])
        self.assertEqual(result['status'], 'preparing')
        row = self.db.execute('SELECT upstream FROM jobs WHERE id=?', (first['id'],)).fetchone()
        self.assertEqual(json.loads(row[0])['id'], 'finished-cloud-job')

    def test_expired_lease_can_be_recovered_but_active_lease_cannot(self):
        first = self.create()
        self.assertIsNotNone(worker.claim(self.db))
        self.assertIsNone(worker.claim(self.db))
        self.db.execute('UPDATE jobs SET lease_until=? WHERE id=?', (time.time() - 1, first['id']))
        self.assertIsNotNone(worker.claim(self.db))

    def test_delete_removes_private_payload_and_assets_and_cancels_upstream(self):
        first = self.create()
        self.db.execute('UPDATE jobs SET upstream=? WHERE id=?', (json.dumps({'id': 'cloud-job'}), first['id']))
        folder = Path(self.directory.name) / first['id']; folder.mkdir(); (folder / 'layer-0.png').write_bytes(b'private')
        store.dispatch(self.db, 'delete', {'owner': 'owner-a', 'id': first['id']})
        fake = FakeInko(); worker.sync_cancelled(self.db, fake)
        self.assertFalse(folder.exists())
        self.assertEqual(len(fake.cancelled), 1)
        row = self.db.execute('SELECT * FROM jobs WHERE id=?', (first['id'],)).fetchone()
        self.assertEqual(row['payload'], '{}')
        self.assertEqual(row['pages'], '[]')


class PricingAndLayout(unittest.TestCase):
    def test_only_explicit_numeric_zero_is_accepted(self):
        provider.zero_price({'price': {'list_cents': 0}})
        for quote in ({}, {'price': {}}, {'price': {'list_cents': None}}, {'price': {'list_cents': False}},
                      {'price': {'list_cents': '0'}}, {'price': {'list_cents': 1}}, {'price': {'list_cents': 0}, 'cost_cents': 1}):
            with self.assertRaises(provider.ProviderError):
                provider.zero_price(quote)

    def test_layout_keeps_exact_text_and_reserves_label_area(self):
        layout = provider.layout_for(CONTENT)
        self.assertEqual(layout['text'], CONTENT['text'])
        self.assertGreaterEqual(layout['d']['margins'][2], 42)
        self.assertEqual(layout['marks'][0]['start'], CONTENT['blocks'][0]['start'])

    def test_missing_glyphs_are_reported_without_substitution(self):
        client = provider.Inko('unused')
        with patch.object(client, 'call', return_value={'ok': False, 'errors': [{'symbol': '學'}], 'price': {'list_cents': 0}}):
            with self.assertRaises(provider.ProviderError) as raised:
                client.preflight(CONTENT)
        self.assertEqual(raised.exception.code, 'UNWRITABLE_TEXT')
        self.assertEqual(raised.exception.positions, [{'symbol': '學', 'position': 0}])

    def test_unplaced_text_stops_generation(self):
        client = provider.Inko('unused')
        with patch.object(client, 'call', side_effect=[{'ok': True, 'price': {'list_cents': 0}, 'style': {'ref': '12'}}, {'pages': 1, 'unplaced': 1, 'price': {'list_cents': 0}}]):
            with self.assertRaises(provider.ProviderError) as raised:
                client.preflight(CONTENT)
        self.assertEqual(raised.exception.code, 'LAYOUT_OVERFLOW')

    def test_provider_cannot_silently_replace_the_selected_style(self):
        client = provider.Inko('unused')
        with patch.object(client, 'call', return_value={'ok': True, 'price': {'list_cents': 0}, 'style': {'ref': '1'}}):
            with self.assertRaises(provider.ProviderError) as raised:
                client.preflight(CONTENT)
        self.assertEqual(raised.exception.code, 'STYLE_UNAVAILABLE')

    def test_scene_coverage_uses_utf16_and_rejects_missing_glyphs(self):
        text = '甲𠮷\n乙'
        document = {'text': text, 'pages': [{'glyphs': [{'i': 0, 'j': 1}, {'i': 1, 'j': 3}, {'i': 4, 'j': 5}]}]}
        verify_text_coverage(document, text)
        document['pages'][0]['glyphs'].pop()
        with self.assertRaises(ValueError):
            verify_text_coverage(document, text)


if __name__ == '__main__':
    unittest.main()
