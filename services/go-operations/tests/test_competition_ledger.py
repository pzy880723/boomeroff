from contextlib import closing
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest

from competition import Competition
from erp import Actor, Fault


@unittest.skipUnless(os.environ.get('GO_TEST_BATTLE_ROOT'), 'requires the pinned Battle release')
class LedgerTest(unittest.TestCase):
    def test_web_and_mini_share_reporting_cutoff_and_correction(self):
        root = Path(os.environ['GO_TEST_BATTLE_ROOT'])
        sys.path.append(str(root / 'runtime'))
        self.addCleanup(sys.path.pop)
        spec = importlib.util.spec_from_file_location('battle_runtime', root / 'runtime' / 'server.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        key = 'a' * 64
        epoch = 1795536000
        day = module.today_at(epoch)
        origin = 'https://battle.boomeroff.top'
        web_headers = {'host': 'battle.boomeroff.top', 'origin': origin, 'content-type': 'application/json'}
        codes = {'xtd': 'A' * 15, 'citic': 'B' * 15, 'metro': 'C' * 15}
        with tempfile.TemporaryDirectory() as temp, closing(module.open_db(':memory:')) as db:
            cfg = module.load_config({'PUBLIC_ORIGIN': origin, 'GO_BATTLE_BRIDGE_KEY': key,
                'BATTLE_CYCLE_PATH': temp + '/cycle.json', **{
                    module.CODE_KEYS[code]: hashlib.sha256(value.encode()).hexdigest()
                    for code, value in codes.items()}})
            battle = module.BattleApplication(cfg, db)

            def transport(req):
                url = urlsplit(req.full_url)
                status, _, raw = battle.handle(req.method, url.path + ('?' + url.query if url.query else ''),
                    dict(req.header_items()), req.data or b'', epoch=epoch)
                if status >= 400:
                    raise HTTPError(req.full_url, status, 'error', {}, BytesIO(raw))
                return json.loads(raw)

            service = Competition(key, {code: code for code in codes}, transport)
            admin = Actor('test-admin', ('super_admin',), ())
            citic = Actor('test-staff', ('store_staff',), (('citic', '中信泰富'),))
            metro = Actor('test-staff-2', ('store_manager',), (('metro', '美罗城'),))

            def mini(actor, route, data=None):
                return service.route(actor, 'POST' if data is not None else 'GET', route, '', lambda: data)

            def web(path, body=None, **extra):
                status, headers, raw = battle.handle('GET' if body is None else 'POST', path,
                    {**web_headers, **extra}, json.dumps(body).encode() if body else b'', epoch=epoch)
                return status, headers, json.loads(raw)

            _, headers, _ = web('/api/bind', {'code': codes['xtd']})
            cookie = headers['Set-Cookie'].split(';')[0]
            web_report = {'date': day, 'salesCents': 15110, 'orders': 4}
            self.assertEqual(web('/api/report', web_report, cookie=cookie)[0], 201)
            self.assertEqual(web('/api/internal/go/state', cookie=cookie)[0], 404)
            partial = mini(citic, 'state')
            self.assertIsNone(partial['latest'])
            self.assertIsNone(partial['selected'])
            self.assertNotIn('adminSelected', partial)
            self.assertEqual(partial['submission']['stores'], {'xtd': True, 'citic': False, 'metro': False})

            for actor, cents in [(citic, 21900), (metro, 32000)]:
                self.assertTrue(mini(actor, 'report', {'date': day, 'salesCents': cents, 'orders': 1})['ok'])
            result = mini(admin, 'state')
            self.assertEqual(result['latest'], web('/api/state', cookie=cookie)[2]['latest'])
            version = result['adminSelected']['stores']['citic']['version']
            correction = {'store': 'citic', 'date': day, 'salesCents': 100, 'orders': 2,
                'reason': '测试更正', 'expectedVersion': version, 'confirmCorrection': True}
            self.assertTrue(mini(admin, 'admin/report', correction)['ok'])
            self.assertEqual(web('/api/state', cookie=cookie)[2]['latest']['totals']['citic'], 100)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM audit_log').fetchone()[0], 1)
            with self.assertRaises(Fault) as conflict:
                mini(admin, 'admin/report', correction)
            self.assertEqual(conflict.exception.status, 409)

            current = mini(admin, 'admin/cycle')
            settings = {'mode': 'custom_dates', 'startDate': '2026-01-01', 'endDate': '2026-01-02',
                'expectedVersion': current['cycle']['version'], 'confirmed': True}
            self.assertEqual(mini(admin, 'admin/cycle', settings)['cycle']['mode'], 'custom_dates')
            self.assertIsNone(web('/api/state', cookie=cookie)[2]['latest'])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM reports').fetchone()[0], 3)
