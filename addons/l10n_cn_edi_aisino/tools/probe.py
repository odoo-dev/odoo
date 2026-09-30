#!/usr/bin/env python3
# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Probe the Aisino Yunshui (爱信诺云税) sandbox once credentials land.

Answers the questions their 20260909 reply sheet left open, without asking them
again. Standalone: no Odoo, stdlib + the sibling crypto module only.

    export AISINO_IDENTITY_CODE=...   # 授权码
    export AISINO_PLATFORM_CODE=...   # 组织编码
    export AISINO_TAX_NO=...          # 税号
    export AISINO_PROXY=http://user:pass@host:port   # optional: mainland IP Aisino whitelisted
    python3 probe.py envelope         # offline, run this first
    python3 probe.py auth             # is our envelope right? (read-only)
    python3 probe.py keyvariant       # only if auth fails: which derivation works?
    python3 probe.py redform          # RPA-or-API characterisation (read-only)
    python3 probe.py ratelimit        # opt-in ramp (read-only)
    python3 probe.py all              # every read-only phase

Write flow on the TEST environment (--allow-writes; add --dry-run to only print):

    export AISINO_ETAX_USERNAME=...   # 电子税务局 account of the drawer
    export AISINO_ETAX_PASSWORD=...   # optional: Yunshui uses the stored one if absent
    python3 probe.py login            # interactive: SMS / QR / 责任人 steps
    python3 probe.py issue            # blue 数电普票, then poll until issued
    python3 probe.py red              # full red of that blue in ONE call, then poll
    python3 probe.py margin           # 差额发票 via 3.2.14: doc says yes, vendor says no

What the red phase needs from the issue phase is kept in
~/.config/l10n_cn_edi/probe_state.json (chmod 600, no credentials in it).

Interface codes come from the v1.8.4 spec (PDF pages noted per code); section
numbers moved between versions, so everything is keyed on 接口编码.
"""
import argparse
import base64
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from crypto import sm4_envelope as env  # noqa: E402

import local_env  # noqa: E402

local_env.load()

HOSTS = {
    'test': 'https://llys.51fapiao.cn/openapi',   # 测试环境
    'prod': 'https://ll.51fapiao.cn/openapi',     # 生产环境
}

CODES = {
    'tax_codes': 'smartCoding.batchTaxCode',      # read-only, no login needed
    'enterprise_card': 'ele.query.gfxx2',         # read-only
    'credit_line': 'ele.creditLine',              # read-only, needs login
    'red_form_query': 'ele.hzqrd.query',          # read-only, 2.1.11
    'invoice_issue': 'ele.encrypt.invoiceIssue',  # WRITES, 2.1.1
    'simple_issue': 'ele.encrypt.simpleInvoiceIssue',  # WRITES, 2.1.2 (p.47): 数电 81/82 only, full red in one call
    'query_result': 'ele.encrypt.queryResult',    # 2.1.3 (p.75)
    'direct_issue': 'h5.js.blueInvoiceIssu.gm',   # WRITES, 3.2.14 (p.229): "支持...差额票的开具"
    'process_order': 'ele.encrypt.processOrder',  # WRITES
    'login': 'ele.eleLogin',                      # 2.1.4 (p.78)
}

STATE_FILE = os.path.expanduser('~/.config/l10n_cn_edi/probe_state.json')
# 2.1.3: 1000 开票成功, 1002 开票中, 1101 需重新登陆, 1102 需扫二维码; 3203 wants reloginflag (2.1.4 #16).
ISSUED, ISSUING = '1000', '1002'
NEEDS_LOGIN = {'1101', '1102', '3203'}
# The smallest plausible line: a 6% service, outside the test env's medical/jewellery exclusions.
# ASSUMPTION: 3040201010000000000 = 软件开发服务; any valid 19-digit service code will do.
PROBE_ITEM = {'name': '软件开发服务费', 'code': '3040201010000000000', 'rate': '0.06'}


class Probe:
    def __init__(self, args):
        self.base = HOSTS[args.host]
        self.identity = os.environ.get('AISINO_IDENTITY_CODE', '')
        self.platform = os.environ.get('AISINO_PLATFORM_CODE', '')
        self.tax_no = os.environ.get('AISINO_TAX_NO', '')
        self.timeout = args.timeout
        # Only this probe goes through the proxy: an HTTPS_PROXY in the shell would also route
        # the Nuonuo probe, whose gateway is production. An empty mapping ignores HTTPS_PROXY.
        proxy = os.environ.get('AISINO_PROXY')
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({'http': proxy, 'https': proxy} if proxy else {}),
        )
        print(f'route: {"proxy " + proxy.rpartition("@")[2] if proxy else "direct"}')
        self.allow_writes = args.allow_writes
        self.dry_run = args.dry_run
        if self.dry_run:
            # Dummy values only for printing: a dry run never sends anything.
            self.identity = self.identity or 'DRYRUNIDENTITY01'
            self.platform = self.platform or 'dryrun'
            self.tax_no = self.tax_no or '91440300DRYRUN000X'
        self.username = os.environ.get('AISINO_ETAX_USERNAME', '')
        self.password = os.environ.get('AISINO_ETAX_PASSWORD', '')
        self.company_name = os.environ.get('AISINO_COMPANY_NAME', '深圳市华夏光电子有限公司')  # the test tenant's name
        self.write_phase = args.phase in ('login', 'issue', 'red', 'margin')
        if self.write_phase and args.host != 'test':
            sys.exit('write phases only run against the test host')
        self.findings = {}
        if args.host == 'prod' and not args.i_mean_production:
            sys.exit('refusing prod without --i-mean-production')

    def _require_creds(self):
        missing = [n for n, v in (
            ('AISINO_IDENTITY_CODE', self.identity),
            ('AISINO_PLATFORM_CODE', self.platform),
            ('AISINO_TAX_NO', self.tax_no),
        ) if not v]
        if missing:
            sys.exit(f"missing env: {', '.join(missing)}")

    def call(self, code, payload, key_override=None, timestamp=None):
        """POST one enveloped request. Returns (elapsed_s, http_status, parsed_or_raw)."""
        if self.dry_run:
            ts = timestamp or env.now_timestamp()
            body = env.build_request(code, payload, self.identity, self.platform, self.tax_no, timestamp=ts)
            print(f'  -- {code} (dry run, not sent) --')
            print('  plaintext:')
            print('    ' + json.dumps(payload, ensure_ascii=False, indent=2).replace('\n', '\n    '))
            back = env.verify_and_decrypt(dict(body, code='1000'), self.identity, self.platform)
            print(f'  envelope: {len(json.dumps(body))} bytes, round-trips: {back == payload}')
            return 0.0, None, {}
        ts = timestamp or env.now_timestamp()
        if key_override is None:
            body = env.build_request(code, payload, self.identity, self.platform,
                                     self.tax_no, timestamp=ts)
        else:
            # hand-rolled so a non-standard key derivation can be tried
            access_token = env.make_access_token(self.platform, self.tax_no, ts)
            json_str = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
            datagram = env._build_datagram(json_str, key_override, '0')
            body = {
                'interfaceCode': code, 'zipCode': '0', 'encryptCode': env.ENCRYPT_CODE,
                'access_token': access_token, 'datagram': datagram,
                'signtype': env.SIGNTYPE,
                'signature': env.sign(code, '0', env.ENCRYPT_CODE, access_token,
                                      datagram, env.SIGNTYPE, key_override),
            }
        req = urllib.request.Request(
            f'{self.base}/{code}',
            data=json.dumps(body).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        started = time.monotonic()
        try:
            with self.opener.open(req, timeout=self.timeout) as resp:
                raw = resp.read().decode('utf-8', 'replace')
                status = resp.status
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode('utf-8', 'replace')
            status = exc.code
        except Exception as exc:  # noqa: BLE001 - a timeout IS the finding here
            return time.monotonic() - started, None, f'{type(exc).__name__}: {exc}'
        elapsed = time.monotonic() - started
        try:
            return elapsed, status, json.loads(raw)
        except json.JSONDecodeError:
            return elapsed, status, raw  # HTML error page is itself a finding

    # --- phase 0: offline -------------------------------------------------

    def phase_envelope(self):
        """Prove the envelope round-trips before blaming the network for anything."""
        print('== envelope (offline) ==')
        ok = True
        for zip_code in ('0', '1', '2'):
            payload = {'probe': 'ok', '中文': '测试', 'n': 1234.56}
            req = env.build_request('x', payload, 'IDENT', 'PLAT', 'TAX',
                                    timestamp='20231014180655', zip_code=zip_code)
            back = env.verify_and_decrypt(
                dict(req, code='1000'), 'IDENT', 'PLAT')
            good = back == payload
            ok &= good
            print(f'  zipCode {zip_code}: {"ok" if good else "MISMATCH"}')
        if self.identity and self.platform:
            ts = env.now_timestamp()
            print(f'\n  key candidates for ts={ts}:')
            for name, key in self._key_variants(ts).items():
                print(f'    {name:16} {key!r}')
            print('  (we ship "middle16"; the spec prose says "16 位 MD5",')
            print('   the Java demo says substring(8, 24) -- that is the ambiguity)')
        self.findings['envelope_roundtrip'] = ok
        return ok

    def _key_variants(self, ts):
        import hashlib
        md5hex = hashlib.md5(
            (self.identity + self.platform + ts).encode('utf-8')).hexdigest()
        return {
            'middle16': md5hex[8:24].encode(),   # what we implement
            'first16': md5hex[:16].encode(),
            'last16': md5hex[16:].encode(),
            'hexdecoded8': bytes.fromhex(md5hex[8:24]),  # 8 bytes, likely invalid
        }

    # --- phase 1: is the envelope right? ----------------------------------

    def phase_auth(self):
        """Cheapest read-only call. A non-signature error means the envelope is fine."""
        self._require_creds()
        print('== auth (envelope against the real server) ==')
        code = CODES['tax_codes']
        # 2.1.27 (p.126): query_type + product_value are mandatory; a name lookup is the smallest valid query.
        elapsed, status, body = self.call(code, {'query_type': '1', 'product_value': '软件开发服务'})
        print(f'  {code} -> HTTP {status} in {elapsed:.2f}s')
        print(f'  {json.dumps(body, ensure_ascii=False)[:400] if isinstance(body, dict) else str(body)[:400]}')
        outer = body.get('code') if isinstance(body, dict) else None
        sig_error = outer in ('9995', '9996') or '加解密失败' in str(body.get('msg', '') if isinstance(body, dict) else body)
        self.findings['auth'] = {'status': status, 'outer_code': outer,
                                 'signature_rejected': bool(sig_error)}
        if sig_error:
            print('\n  SIGNATURE REJECTED -> run:  probe.py keyvariant')
        elif outer == '1000':
            print('\n  envelope accepted, key derivation confirmed')
        else:
            print(f'\n  envelope accepted at transport level; business code {outer}')
        return not sig_error

    def phase_keyvariant(self):
        """Only worth running if auth failed: try every plausible key derivation."""
        self._require_creds()
        print('== keyvariant (which SM4 key does the server expect?) ==')
        code = CODES['tax_codes']
        ts = env.now_timestamp()
        for name, key in self._key_variants(ts).items():
            if len(key) != 16:
                print(f'  {name:16} skipped ({len(key)} bytes, SM4 needs 16)')
                continue
            try:
                _, status, body = self.call(code, {'pageNo': 1, 'pageSize': 1},
                                            key_override=key, timestamp=ts)
            except Exception as exc:  # noqa: BLE001
                print(f'  {name:16} raised {exc}')
                continue
            outer = body.get('code') if isinstance(body, dict) else '?'
            msg = body.get('msg', '') if isinstance(body, dict) else str(body)[:60]
            verdict = 'ACCEPTED' if outer == '1000' else f'rejected {outer} {msg}'
            print(f'  {name:16} HTTP {status} -> {verdict}')
            self.findings.setdefault('key_variants', {})[name] = verdict

    # --- phase 2: RPA or API? ---------------------------------------------

    def phase_redform(self, samples=8):
        """Latency spread and error shape say more than their naming does.

        A real API answers fast and consistently, and rejects junk with a code.
        Something driving the bureau's H5 portal is slow, jittery, and tends to
        surface timeouts or HTML instead.
        """
        self._require_creds()
        print('== redform (read-only characterisation) ==')
        code = CODES['red_form_query']
        times = []
        for i in range(samples):
            elapsed, status, body = self.call(code, {'pageNo': 1, 'pageSize': 10})
            times.append(elapsed)
            outer = body.get('code') if isinstance(body, dict) else 'non-json'
            print(f'  #{i + 1} {elapsed:6.2f}s HTTP {status} code={outer}')
        if times:
            spread = max(times) / max(min(times), 0.001)
            print(f'\n  min {min(times):.2f}s  median {statistics.median(times):.2f}s  '
                  f'max {max(times):.2f}s  spread x{spread:.1f}')
            print('  >2s median or >3x spread reads like automation, not an API')
            self.findings['redform_latency'] = {
                'min': min(times), 'median': statistics.median(times),
                'max': max(times), 'spread': spread}

        print('\n  -- malformed input, what shape is the error? --')
        _, status, body = self.call(code, {'pageNo': 'not-a-number', 'bogus': '???'})
        kind = 'structured json' if isinstance(body, dict) else 'raw/html'
        print(f'  HTTP {status}, {kind}: {str(body)[:200]}')
        self.findings['redform_error_shape'] = kind

        print('\n  -- 4 concurrent calls --')
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(
                lambda _: self.call(code, {'pageNo': 1, 'pageSize': 10}), range(4)))
        for i, (elapsed, status, body) in enumerate(results):
            outer = body.get('code') if isinstance(body, dict) else 'non-json'
            print(f'  #{i + 1} {elapsed:6.2f}s HTTP {status} code={outer}')
        serialised = max(r[0] for r in results) > 2 * statistics.median(times or [1])
        print(f'  {"serialised (one session behind it?)" if serialised else "parallel"}')
        self.findings['redform_concurrency'] = 'serialised' if serialised else 'parallel'

    def phase_ratelimit(self, burst=30, pause=0.0):
        """Their Q5 answer was 待回复. Find the working number ourselves."""
        self._require_creds()
        print(f'== ratelimit (read-only, burst={burst}) ==')
        code = CODES['red_form_query']
        first_reject = None
        for i in range(burst):
            elapsed, status, body = self.call(code, {'pageNo': 1, 'pageSize': 1})
            outer = body.get('code') if isinstance(body, dict) else 'non-json'
            throttled = status == 429 or 'limit' in str(body).lower() or '频' in str(body)
            print(f'  #{i + 1:3} {elapsed:6.2f}s HTTP {status} code={outer}'
                  f'{"  <-- THROTTLED" if throttled else ""}')
            if throttled and first_reject is None:
                first_reject = i + 1
                break
            if pause:
                time.sleep(pause)
        self.findings['rate_limit_first_reject'] = first_reject
        print(f'\n  {"throttled after " + str(first_reject) if first_reject else "no throttling in " + str(burst)} calls')
        print('  (sandbox enforcement, not a contractual limit -- still ask for that)')

    # --- phase 3: writes ---------------------------------------------------

    def _require_writes(self):
        if not (self.allow_writes or self.dry_run):
            sys.exit('this phase issues documents on the test env: re-run with --allow-writes (or --dry-run)')
        if not self.dry_run:
            self._require_creds()

    @staticmethod
    def _serial():
        # 3.2.14 forbids '_' and '-' in the serial; letters and digits only everywhere.
        return f'PROBE{time.strftime("%Y%m%d%H%M%S")}'

    def _load_state(self):
        try:
            with open(STATE_FILE, encoding="utf-8") as fh:
                return json.load(fh)
        except FileNotFoundError:
            return {}

    def _save_state(self, **values):
        if self.dry_run:
            return
        state = {**self._load_state(), **values}
        fd = os.open(STATE_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(state, fh, ensure_ascii=False, indent=2)

    def _show(self, code, status, body):
        text = json.dumps(body, ensure_ascii=False) if isinstance(body, dict) else str(body)
        print(f'  {code} -> HTTP {status}: {text[:600]}')
        # The envelope wraps the business answer; unwrap it when the response is encrypted.
        if isinstance(body, dict) and body.get('datagram'):
            try:
                inner = env.verify_and_decrypt(body, self.identity, self.platform, strict=False)
                print(f'  decrypted: {json.dumps(inner, ensure_ascii=False)[:800]}')
                return inner
            except Exception as exc:  # noqa: BLE001 - a bad response is a finding too
                print(f'  could not decrypt the answer: {exc}')
        return body if isinstance(body, dict) else {}

    # --- phase 3: login (2.1.4) --------------------------------------------

    def phase_login(self):
        """Walk ele.eleLogin's step machine: step_code tells which step_name comes next."""
        self._require_writes()
        if not self.username and not self.dry_run:
            sys.exit('set AISINO_ETAX_USERNAME (the drawer\'s 电子税务局 account)')
        print('== login (ele.eleLogin, 2.1.4) ==')
        code = CODES['login']
        request = {'step_name': 'login', 'nsrsbh': self.tax_no, 'username': self.username or 'DRYRUN'}
        if self.password:
            request['password'] = self.password
        for _ in range(20):
            _, status, body = self.call(code, request)
            if self.dry_run:
                return
            answer = self._show(code, status, body)
            step = str(answer.get('step_code', ''))
            base = {'nsrsbh': self.tax_no, 'username': self.username}
            if step == '0':
                print('\n  LOGGED IN')
                self.findings['login'] = 'ok'
                return
            if step == '1':
                choice = input('  second factor: [s]ms or [q]r code? ').strip().lower()
                request = {**base, 'step_name': 'send_sms' if choice == 's' else 'create_qrcode'}
            elif step == '2':
                print(f'  choose a 责任人 (01 法人, 02 财务负责人, 03 办税员, 09 开票员...): {answer.get("data")}')
                request = {**base, 'step_name': 'select_zrrlx', 'zrrlx': input('  zrrlx: ').strip()}
            elif step == '3':
                request = {**base, 'step_name': 'sms_login', 'smsCode': input('  SMS code: ').strip()}
            elif step == '4':
                if answer.get('qrcode'):
                    path = '/tmp/yunshui_login_qr.png'
                    with open(path, 'wb') as fh:
                        fh.write(base64.b64decode(answer['qrcode']))
                    print(f'  scan {path} with the tax bureau app (expires in {answer.get("expires_in")} s)')
                    qrcode_id = answer.get('qrcode_id')
                time.sleep(5)  # the spec recommends polling every 4-5 s
                request = {**base, 'step_name': 'verify_qrcode', 'qrcode_id': qrcode_id}
            elif step == '5':
                time.sleep(2)
                request = {**base, 'step_name': 'query_auto_login_res'}
            else:
                print(f'\n  login stopped at step_code {step!r}: see the answer above')
                self.findings['login'] = answer
                return
        print('  gave up after 20 steps')

    # --- phase 4: blue fapiao (2.1.2 + 2.1.3) -------------------------------

    def _poll_result(self, serial, invoice_kind='82', tries=12):
        code = CODES['query_result']
        for i in range(tries):
            _, status, body = self.call(code, {'fpqqlsh': serial, 'nsrsbh': self.tax_no, 'invoiceKind': invoice_kind})
            if self.dry_run:
                return {}
            answer = self._show(code, status, body)
            result = str(answer.get('code', ''))
            if result == ISSUED:
                return answer
            if result in NEEDS_LOGIN:
                print(f'\n  {result}: the e-tax session is gone -> run: probe.py login --allow-writes')
                return answer
            if result != ISSUING:
                print(f'\n  not issued: {result} {answer.get("message")}')
                return answer
            print(f'  still issuing ({i + 1}/{tries}), next look in 5 s')
            time.sleep(5)
        return {}

    def phase_issue(self):
        """One small blue 数电普票 to a natural person, then its result and files."""
        self._require_writes()
        print('== issue (simpleInvoiceIssue, 2.1.2) ==')
        serial = self._serial()
        payload = {
            'fpqqlsh': serial,
            'nsrsbh': self.tax_no,
            'invoiceKind': '82',      # 普通发票[数电]
            'businessType': '0',      # 0 个人: no buyer tax number needed
            'invoiceType': '1',       # 蓝票
            'invoiceAmount': '1.06',  # 含税
            'payerName': '测试个人',
            'deliverType': '0',       # 不交付
            'bz': 'Odoo probe, test environment',
            'invoiceItems': [{
                'rowType': '0',
                'itemName': PROBE_ITEM['name'],
                'amount': '1.06',
                'quantity': '1',
                'taxRate': PROBE_ITEM['rate'],
                'itemNo': PROBE_ITEM['code'],
            }],
        }
        _, status, body = self.call(CODES['simple_issue'], payload)
        if self.dry_run:
            self._poll_result(serial)
            return
        answer = self._show(CODES['simple_issue'], status, body)
        if str(answer.get('code', '')) != ISSUED:
            print('\n  request refused: see the answer above')
            self.findings['issue'] = answer
            return
        self._save_state(blue_serial=serial)
        result = self._poll_result(serial)
        if str(result.get('code', '')) == ISSUED:
            self._save_state(blue_fapiao_no=result.get('fphm'), blue_date=result.get('kprq'))
            print(f'\n  ISSUED {result.get("fphm")} at {result.get("kprq")}; pdf={bool(result.get("pdfUrl"))} ofd={bool(result.get("ofdUrl"))}')
        self.findings['issue'] = result

    # --- phase 5: full red in one call (2.1.2) ------------------------------

    def phase_red(self):
        """2.1.2: a blue issued on this platform is reversed in full by one call, no red form step."""
        self._require_writes()
        print('== red (simpleInvoiceIssue invoiceType=2, 2.1.2) ==')
        state = self._load_state()
        blue_no = state.get('blue_fapiao_no') or ('DRYRUNBLUE0000000000' if self.dry_run else None)
        if not blue_no:
            sys.exit(f'no blue fapiao in {STATE_FILE}: run the issue phase first')
        serial = self._serial()
        # "红冲时, 金额相关字段和发票明细都不需要传值"
        payload = {
            'fpqqlsh': serial,
            'nsrsbh': self.tax_no,
            'invoiceType': '2',
            'originInvoiceNo': blue_no,
            'redReason': '01',  # 开票有误: always full red
            'deliverType': '0',
        }
        _, status, body = self.call(CODES['simple_issue'], payload)
        if self.dry_run:
            self._poll_result(serial)
            return
        answer = self._show(CODES['simple_issue'], status, body)
        if str(answer.get('code', '')) != ISSUED:
            print('\n  red request refused: see the answer above')
            self.findings['red'] = answer
            return
        result = self._poll_result(serial)
        if str(result.get('code', '')) == ISSUED:
            self._save_state(red_serial=serial, red_fapiao_no=result.get('fphm'))
            print(f'\n  RED ISSUED {result.get("fphm")} against {blue_no}, with no red form step')
        self.findings['red'] = result

    # --- phase 6: 差额 (3.2.14) ----------------------------------------------

    def phase_margin(self):
        """Q1: they said 都不支持差额发票, yet 3.2.14 says it issues 差额票 (cezslx_dm 02).

        Sends a complete 差额 invoice. "请求报文不能缺少节点": every node goes, empty or not.
        """
        self._require_writes()
        print('== margin / 差额发票 (h5.js.blueInvoiceIssu.gm, 3.2.14) ==')
        # 100.00 含税, 50.00 deductible: tax = (100 - 50) / 1.06 * 0.06 = 2.83.
        item_name = f'*信息技术服务*{PROBE_ITEM["name"]}'  # 3.2.14 wants the *简称* prefix
        header = dict.fromkeys((
            'tdys', 'jazslx_dm', 'sgfplx_dm', 'fpfxyj_dm', 'cktslx_dm', 'swjg_dm', 'xhf_dzdh', 'xhf_yhzh', 'xhf_dz',
            'xhf_dh', 'xhf_yh', 'xhf_zh', 'ghf_nsrsbh', 'ghf_dzdh', 'ghf_yhzh', 'ghf_dz', 'ghf_dh', 'ghf_yh', 'ghf_zh',
            'ghf_email', 'ghf_sj', 'kpy', 'jbr', 'jbr_sj', 'jbr_sflx', 'jbr_sfzhm', 'jbr_gj', 'sky', 'fhr', 'kprq',
            'sslkjly', 'hzqrdbh', 'hzqrduuid', 'yfp_hm', 'yfp_dm', 'ykprq', 'yfpzl_dm', 'is_dae', 'zpfp_dm', 'fppzl',
            'jf_email', 'jf_phone', 'qyjjpp', 'macdz', 'byzd1', 'byzd2', 'byzd3', 'byzd4', 'byzd5',
        ), '')
        header.update({
            'fpqqlsh': self._serial(),
            'cezslx_dm': '02',       # 差额开票
            'nsrmc': self.company_name,
            'nsrsbh': self.tax_no,
            'kpxm': item_name,       # "必须与项目信息中第一条数据的项目名称保持一致"
            'kplx': '1',             # 蓝票
            'bmb_bbh': '50.0',       # ASSUMPTION: 2.1.1's bmbbbh is "固定值 50.0"; 3.2.14 gives no value
            'xhfmc': self.company_name,
            'xhf_nsrsbh': self.tax_no,
            'ghfqylx': '03',         # 个人
            'ghfmc': '测试个人',
            'fpzl_dm': '82',         # 普通发票[数电]
            'xsfzrr_bz': 'N',
            'gmfzrr_bz': 'Y',
            'zzfp_bz': 'N',
            'hpzzfp_bz': 'N',
            'sfzsgmfyhzh': 'N',
            'sfzsxsfyhzh': 'N',
            'sfzsgmfdzdh': 'N',
            'sfzsxsfdzdh': 'N',
            'kphjje': '100.00',
            'hjbhsje': '97.17',
            'hjse': '2.83',
            'bz': 'Odoo probe, test environment',
        })
        item = dict.fromkeys(('xmjc', 'xmdw', 'ggxh', 'xmsl', 'xmdj', 'lslbs', 'tdzsfs_dm', 'jzjtlxdm',
                              'byzd1', 'byzd2', 'byzd3', 'byzd4', 'byzd5'), '')
        item.update({
            'xh': '1',
            'fphxz': '0',
            'xmmc': item_name,
            'hsbz': '0',              # amounts below are tax excluded
            'spbm': PROBE_ITEM['code'],
            'yhzcbs': '0',
            'zzstsgl': '',            # "必填", but only meaningful with yhzcbs=1
            'xmje': '97.17',
            'sl': PROBE_ITEM['rate'],
            'se': '2.83',
            'kce': '50.00',
        })
        voucher = {
            'xh': '1',
            'pzlx': '08',             # 其他发票类: a made-up voucher is enough to see if 差额 is accepted at all
            'fpdm': '', 'fphm': '', 'zzfphm': '',
            'pzhm': 'PROBE0001',
            'kjrq': time.strftime('%Y-%m-%d'),
            'hjje': '50.00',
            'kce': '50.00',
            'bz': '',
            'lrfs': '手工录入',        # ASSUMPTION: the table only names 勾选录入 / 模板录入
            'bckcje': '50.00',
            'pzhjje': '50.00',
        }
        payload = {'fpkjxx_fptxx': header, 'fpkjxx_xmxxs': [item], 'cepzmxs': [voucher], 'fjys_xxs': []}
        _, status, body = self.call(CODES['direct_issue'], payload)
        if self.dry_run:
            return
        answer = self._show(CODES['direct_issue'], status, body)
        # 3.2.14.3: "code 没有值说明是开具成功".
        if not answer.get('code') and answer.get('fp_hm'):
            print(f'\n  差额 fapiao ISSUED: {answer.get("fp_hm")} -> the spec is right, the vendor reply is wrong')
        else:
            print('\n  refused: quote the code/msg above back to Aisino with question 2')
        self.findings['margin'] = answer


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('phase', choices=['envelope', 'auth', 'keyvariant', 'redform',
                                          'ratelimit', 'login', 'issue', 'red', 'margin', 'all'])
    parser.add_argument('--host', choices=list(HOSTS), default='test')
    parser.add_argument('--timeout', type=float, default=30.0)
    parser.add_argument('--burst', type=int, default=30)
    parser.add_argument('--allow-writes', action='store_true')
    parser.add_argument('--dry-run', action='store_true', help='print the payloads and envelopes, send nothing')
    parser.add_argument('--i-mean-production', action='store_true')
    parser.add_argument('--report', help='write findings as json to this path')
    args = parser.parse_args()

    probe = Probe(args)
    print(f'host: {probe.base}\n')

    if args.phase == 'all':
        if probe.phase_envelope() and probe.phase_auth():
            probe.phase_redform()
            probe.phase_ratelimit(burst=args.burst)
    else:
        getattr(probe, f'phase_{args.phase}')(
            **({'burst': args.burst} if args.phase == 'ratelimit' else {}))

    if args.report:
        with open(args.report, 'w') as fh:
            json.dump(probe.findings, fh, ensure_ascii=False, indent=2)
        print(f'\nfindings -> {args.report}')


if __name__ == '__main__':
    main()
