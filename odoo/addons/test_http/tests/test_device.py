# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from freezegun import freeze_time
from unittest.mock import patch

import odoo

from odoo import Command
from odoo.addons.test_http.utils import (
    TEST_IP,
    USER_AGENT_android_chrome,
    USER_AGENT_linux_chrome,
    USER_AGENT_linux_firefox,
    TEST_IPv4_locations,
    TEST_IPv6_locations,
)
from odoo.addons.base.models.res_device import _logger as res_device_logger
from .test_common import TestHttpBase


class TestDevice(TestHttpBase):

    def setUp(self):
        super().setUp()

        self.Device = self.env['res.device']
        self.DeviceLog = self.env['res.device.log']
        self.DeviceLog.search([]).unlink()

        self.user_admin = self.env.ref('base.user_admin')
        self.user_internal = self.env['res.users'].create({
            'login': 'internal',
            'password': 'internal',
            'name': 'Internal',
            'email': 'internal@example.com',
            'group_ids': [Command.set([self.env.ref('base.group_user').id])],
        })

    def hit(self, session_sid, time, endpoint, headers=None, ip=None):
        if ip:
            headers = headers or {}
            headers = {
                **headers,
                'Host': '',
                'X-Forwarded-For': ip,
                'X-Forwarded-Host': 'odoo.com',
                'X-Forwarded-Proto': 'https'
            }
        with freeze_time(time), \
            patch.dict(odoo.tools.config.options, {'proxy_mode': bool(ip)}):
            res = self.url_open(url=endpoint, headers=headers, cookies={'session_id': session_sid})
        return res

    def info_trace(self, session, trace_position):
        (user_agent, ip_address), (first_activity, last_activity) = list(session['_trace'].values())[trace_position]
        return {
            'elapsed_time': last_activity - first_activity,
            'user_agent': user_agent,
            'ip_address': ip_address,
        }

    def get_devices_logs(self, user=None):
        domain = [('user_id', '=', user.id)] if user else []
        devices = self.Device.search(domain)
        logs = self.DeviceLog.search(domain)
        return devices, logs

    # --------------------
    # DETECTION
    # --------------------

    def test_detection_device_readonly(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 1)
        self.assertEqual(len(session['_trace']), 1)

    def test_detection_device_no_readonly(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 1)
        self.assertEqual(len(session['_trace']), 1)

    def test_detection_user_public(self):
        session = self.authenticate(None, None)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs()
        self.assertEqual(len(devices), 0)
        self.assertEqual(len(logs), 0)

    def test_detection_device_readonly_then_no_readonly(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 1)
        self.assertEqual(len(session['_trace']), 1)

        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 1)
        self.assertEqual(len(session['_trace']), 1)

    def test_detection_device_according_to_time(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 1)
        self.assertEqual(len(session['_trace']), 1)
        self.assertEqual(self.info_trace(session, 0)['elapsed_time'], 0)

        self.hit(session.sid, '2024-01-01 08:30:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 1)
        self.assertEqual(len(session['_trace']), 1)
        self.assertEqual(self.info_trace(session, 0)['elapsed_time'], 0)  # No trace update (< 3600 sec)

        self.hit(session.sid, '2024-01-01 09:00:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 2)
        self.assertEqual(len(session['_trace']), 1)
        self.assertEqual(self.info_trace(session, 0)['elapsed_time'], 3600)

        self.hit(session.sid, '2024-01-01 10:00:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 3)
        self.assertEqual(len(session['_trace']), 1)
        self.assertEqual(self.info_trace(session, 0)['elapsed_time'], 7200)

    def test_detection_device_according_to_useragent(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)

        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0', headers={'User-Agent': USER_AGENT_linux_chrome})

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 1)
        self.assertEqual(len(session['_trace']), 1)
        self.assertEqual(self.info_trace(session, 0)['user_agent'], USER_AGENT_linux_chrome)

        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0', headers={'User-Agent': USER_AGENT_linux_firefox})

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 2)
        self.assertEqual(len(session['_trace']), 2)
        self.assertEqual(self.info_trace(session, 1)['user_agent'], USER_AGENT_linux_firefox)

    def test_detection_device_according_to_ipaddress(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 1)
        self.assertEqual(len(session['_trace']), 1)

        self.hit(session.sid, '2024-01-01 08:00:01', '/test_http/greeting-public?readonly=0', ip=TEST_IP)

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 2)
        self.assertEqual(len(session['_trace']), 2)
        self.assertNotEqual(self.info_trace(session, 0)['ip_address'], TEST_IP)
        self.assertEqual(self.info_trace(session, 1)['ip_address'], TEST_IP)

        localized_device = devices.filtered(lambda device: device.ip_address == TEST_IP)
        self.assertEqual(localized_device.country, 'France')

    def test_detection_usurpation_sid(self):
        session = self.authenticate(self.user_internal.login, self.user_internal.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-user?readonly=0')

        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-user?readonly=0', headers={'session_id': session.sid}, ip=TEST_IP)
        devices, logs = self.get_devices_logs(self.user_internal)
        self.assertEqual(len(devices), 1)
        self.assertEqual(len(logs), 2)
        self.assertEqual(len(self.user_internal.device_ids), 1)

    def test_detection_devices_according_to_time_useragent(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0', headers={'User-Agent': USER_AGENT_linux_chrome})
        self.assertEqual(len(self.user_admin.device_ids), 1)

        self.hit(session.sid, '2024-01-01 09:00:00', '/test_http/greeting-public?readonly=0', headers={'User-Agent': USER_AGENT_linux_chrome})
        self.assertEqual(len(self.user_admin.device_ids), 1)

        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0', headers={'User-Agent': USER_AGENT_linux_firefox})
        self.assertEqual(len(self.user_admin.device_ids), 1)

        self.hit(session.sid, '2024-01-01 09:00:00', '/test_http/greeting-public?readonly=0', headers={'User-Agent': USER_AGENT_linux_firefox})
        self.assertEqual(len(self.user_admin.device_ids), 1)

    def test_detection_devices_according_to_user_or_admin(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')
        self.hit(session.sid, '2024-01-01 09:00:00', '/test_http/greeting-public?readonly=0')
        session = self.authenticate(self.user_internal.login, self.user_internal.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')
        self.hit(session.sid, '2024-01-01 09:00:00', '/test_http/greeting-public?readonly=0')

        devices, logs = self.get_devices_logs()
        self.assertEqual(len(devices), 2)
        self.assertEqual(len(logs), 4)
        self.assertEqual(len(self.user_admin.device_ids), 1)
        self.assertEqual(len(self.user_internal.device_ids), 1)

        devices_from_admin = self.Device.with_user(self.user_admin).search([])
        devices_from_internal = self.Device.with_user(self.user_internal).search([])
        self.assertEqual(len(devices_from_admin), 2)
        self.assertEqual(len(devices_from_internal), 1)

    def test_detection_no_trace_mechanism(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        session['_trace_disable'] = True
        odoo.http.root.session_store.save(session)
        res = self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')
        self.assertEqual(res.status_code, 200)
        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 0)
        self.assertEqual(len(logs), 0)

    # --------------------
    # DELETION
    # --------------------

    def test_deletion_device(self):
        """
            A user is authenticated and the administrator
            wants to block his device (and therefore its session).
        """
        session = self.authenticate(self.user_internal.login, self.user_internal.login)
        res = self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-user?readonly=0')
        self.assertNotIn('/web/login', res.url)

        user_internal_device = self.user_internal.device_ids
        self.assertEqual(len(user_internal_device), 1)

        user_internal_device._revoke()

        res = self.hit(session.sid, '2024-01-01 08:00:01', '/test_http/greeting-user?readonly=0')
        self.assertIn('/web/login', res.url)

    def test_deletion_invalidate_sid(self):
        session = self.authenticate(self.user_internal.login, self.user_internal.login)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-user?readonly=0')

        self.user_internal.device_ids._revoke()

        res = self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-user?readonly=0', headers={'session_id': session.sid})
        self.assertIn('/web/login', res.url)

    # --------------------
    # FILESYSTEM REFLEXION
    # --------------------

    def _create_device_log_for_user(self, session, count):
        now = int(datetime.now().timestamp())
        for _ in range(count):
            self.DeviceLog.create({
                'session_identifier': odoo.http.root.session_store.generate_key(),
                'user_id': session.uid,
                'user_agent': '',
                'ip_address': '',
                'fingerprint': '',
                'first_activity': datetime.fromtimestamp(now),
                'last_activity': datetime.fromtimestamp(now),
                'revoked': False,
            })

    def test_filesystem_reflexion_user(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self._create_device_log_for_user(session, 10)
        session = self.authenticate(self.user_internal.login, self.user_internal.login)
        self._create_device_log_for_user(session, 10)

        devices, logs = self.get_devices_logs(self.user_internal)
        self.assertEqual(len(devices), 10)
        self.assertEqual(len(logs), 10)
        self.assertEqual(len(self.user_internal.device_ids), 10)

        self.DeviceLog.with_user(self.user_internal)._ResDeviceLog__update_revoked()
        self.DeviceLog.flush_model()  # Because write on ``res.device.log`` and so we have new values in cache
        self.Device.invalidate_model()  # Because it depends on the ``res.device.log`` model (updated in database)

        devices, _ = self.get_devices_logs(self.user_internal)
        self.assertEqual(len(devices), 0)  # No file exist on the filesystem (``revoked`` equals to ``False``)
        self.assertEqual(len(self.user_internal.device_ids), 0)

        # Admin device logs are not updated
        devices, _ = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 10)
        self.assertEqual(len(self.user_admin.device_ids), 10)

    def test_filesystem_reflexion_admin(self):
        session = self.authenticate(self.user_admin.login, self.user_admin.login)
        self._create_device_log_for_user(session, 10)

        devices, logs = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 10)
        self.assertEqual(len(logs), 10)
        self.assertEqual(len(self.user_admin.device_ids), 10)

        session = self.authenticate(self.user_internal.login, self.user_internal.login)
        self._create_device_log_for_user(session, 10)

        devices, logs = self.get_devices_logs(self.user_internal)
        self.assertEqual(len(devices), 10)
        self.assertEqual(len(logs), 10)
        self.assertEqual(len(self.user_internal.device_ids), 10)

        # Admin can update all device logs
        self.DeviceLog.with_user(self.user_admin)._ResDeviceLog__update_revoked()
        self.DeviceLog.flush_model()
        self.Device.invalidate_model()

        devices, _ = self.get_devices_logs(self.user_admin)
        self.assertEqual(len(devices), 0)
        self.assertEqual(len(self.user_admin.device_ids), 0)

        devices, _ = self.get_devices_logs(self.user_internal)
        self.assertEqual(len(devices), 0)
        self.assertEqual(len(self.user_internal.device_ids), 0)

    # --------------------
    # SPECIFIC USE CASE
    # --------------------

    def test_specific_public_user_write(self):
        """
            A public user who hits a non-readonly route
            does not have to create a session file if there
            are no changes in the session itself.
        """
        session = self.authenticate(None, None)
        self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public?readonly=0')

        # As we don't have a uid in the session, we shouldn't go through
        # the session check and therefore we won't go through the device update.
        # `authenticate` method in the test is not the real method.
        # To check that we are not creating a session (by making it dirty),
        # we can check that there is no `_trace`.
        # This means that the device logic will not create a session file
        # (because we are not passing in the `_update_device` logic).
        self.assertFalse(session['_trace'])

    # --------------------
    # UNTRUSTED LOCATIONS
    # --------------------

    def test_untrusted_location_device_ipv4(self):
        self.geoip_resolver.add_locations(TEST_IPv4_locations)
        session = self.authenticate(self.user_admin.login, self.user_admin.login)

        def count_untrusted_device(log_list):
            return len(list(filter(lambda log: 'untrusted device' in log, log_list)))

        with self.assertLogs(res_device_logger) as log_catcher:
            self.hit(session.sid, '2025-01-01 08:00:00', '/test_http/greeting-public', ip='192.0.1.1')  # Belgium, Bruges
            self.hit(session.sid, '2025-01-01 08:00:00', '/test_http/greeting-public', ip='192.0.4.2')  # France, Paris (suspicious)
            self.assertEqual(count_untrusted_device(log_catcher.output), 1)
            self.hit(session.sid, '2025-01-01 08:00:00', '/test_http/greeting-public', ip='192.0.6.1')  # United Kingdom, London (suspicious)
            self.assertEqual(count_untrusted_device(log_catcher.output), 2)
            self.hit(session.sid, '2025-01-15 08:00:00', '/test_http/greeting-public', ip='192.0.1.1')  # Belgium, Bruges
            self.hit(session.sid, '2025-01-15 08:00:00', '/test_http/greeting-public', ip='192.0.6.1')  # United Kingdom, London
            self.hit(session.sid, '2025-02-20 08:00:00', '/test_http/greeting-public', ip='192.0.6.1')  # United Kingdom, London (suspicious)
            self.assertEqual(count_untrusted_device(log_catcher.output), 3)
            self.hit(session.sid, '2024-03-02 08:00:00', '/test_http/greeting-public', ip='192.0.7.1')  # Italy, Rome (suspicious)
            self.assertEqual(count_untrusted_device(log_catcher.output), 4)
            self.hit(session.sid, '2024-02-22 08:00:00', '/test_http/greeting-public', ip='192.0.6.1',
                headers={'User-Agent': USER_AGENT_android_chrome}
            )  # United Kingdom, London (suspicious because the user agent is different)
            self.assertEqual(count_untrusted_device(log_catcher.output), 5)

    def test_untrusted_location_device_ipv6(self):
        self.geoip_resolver.add_locations(TEST_IPv6_locations)
        session = self.authenticate(self.user_admin.login, self.user_admin.login)

        def count_untrusted_device(log_list):
            return len(list(filter(lambda log: 'untrusted device' in log, log_list)))

        with self.assertLogs(res_device_logger) as log_catcher:
            self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public', ip='fe80:0000:0000:0001:abcd:1234:5678:9abc')  # Belgium, Bruges
            self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public', ip='fe80:0000:0000:0003:bcde:2345:6789:abcd')  # France, Paris (suspicious)
            self.assertEqual(count_untrusted_device(log_catcher.output), 1)
            self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public', ip='fe80:0000:0000:0005:abcd:1234:5678:9abc')  # United Kingdom, London (suspicious)
            self.assertEqual(count_untrusted_device(log_catcher.output), 2)
            self.hit(session.sid, '2024-01-15 08:00:00', '/test_http/greeting-public', ip='fe80:0000:0000:0001:abcd:1234:5678:9abc')  # Belgium, Bruges
            self.hit(session.sid, '2024-01-15 08:00:00', '/test_http/greeting-public', ip='fe80:0000:0000:0005:abcd:1234:5678:9abc')  # United Kingdom, London
            # Trust ipv6 on the same network
            self.hit(session.sid, '2024-02-01 08:00:00', '/test_http/greeting-public', ip='fe80:0000:0000:0001:def1:4567:89ab:cdef')  # Netherlands, Rotterdam
            self.assertEqual(count_untrusted_device(log_catcher.output), 2)
            self.hit(session.sid, '2024-03-05 08:00:00', '/test_http/greeting-public', ip='fe80:0000:0000:0005:abcd:1234:5678:9abc',
                headers={'User-Agent': USER_AGENT_android_chrome}
            )  # United Kingdom, London
            self.assertEqual(count_untrusted_device(log_catcher.output), 3)

    def test_untrusted_location_number_trusted_days(self):
        self.geoip_resolver.add_locations(TEST_IPv4_locations)
        session = self.authenticate(self.user_admin.login, self.user_admin.login)

        def count_untrusted_device(log_list):
            return len(list(filter(lambda log: 'untrusted device' in log, log_list)))

        with patch('odoo.http.DEVICE_VALIDITY_PERIOD', 7 * 24 * 60 * 60), self.assertLogs(res_device_logger) as log_catcher:
            self.hit(session.sid, '2024-01-01 08:00:00', '/test_http/greeting-public', ip='192.0.1.1')
            self.hit(session.sid, '2024-01-05 08:00:00', '/test_http/greeting-public', ip='192.0.1.1')
            self.assertEqual(count_untrusted_device(log_catcher.output), 0)  # IP address verified within 7 days
            self.hit(session.sid, '2024-01-15 08:00:00', '/test_http/greeting-public', ip='192.0.1.1')
            self.assertEqual(count_untrusted_device(log_catcher.output), 1)  # IP address not verified within 7 days
            self.hit(session.sid, '2024-01-30 08:00:00', '/test_http/greeting-public', ip='192.0.1.1')
            self.assertEqual(count_untrusted_device(log_catcher.output), 2)  # Because no new trace created
