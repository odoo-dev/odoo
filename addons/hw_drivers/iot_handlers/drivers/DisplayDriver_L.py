# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import jinja2
import json
import logging
import netifaces as ni
import os
import subprocess
import threading
import time
import urllib3

from enum import Enum
from odoo import http
from odoo.addons.hw_drivers.browser import Browser
from odoo.addons.hw_drivers.connection_manager import connection_manager
from odoo.addons.hw_drivers.driver import Driver
from odoo.addons.hw_drivers.event_manager import event_manager
from odoo.addons.hw_drivers.main import iot_devices
from odoo.addons.hw_drivers.tools import helpers
from odoo.tools.misc import file_open, file_path

path = os.path.realpath(os.path.join(os.path.dirname(__file__), '../../views'))
loader = jinja2.FileSystemLoader(path)

jinja_env = jinja2.Environment(loader=loader, autoescape=True)
jinja_env.filters["json"] = json.dumps

pos_display_template = jinja_env.get_template('pos_display.html')

_logger = logging.getLogger(__name__)


class Orientation(Enum):
    """xrandr screen orientation for kiosk mode"""
    NORMAL = 'normal'
    INVERTED = 'inverted'
    LEFT = 'left'
    RIGHT = 'right'


class DisplayDriver(Driver):
    connection_type = 'display'

    def __init__(self, identifier, device):
        super(DisplayDriver, self).__init__(identifier, device)
        self.device_type = 'display'
        self.device_connection = 'hdmi'
        self.device_name = device['name']
        self.event_data = threading.Event()
        self.owner = False
        self.customer_display_data = {}
        self.url = ''
        if self.device_identifier != 'distant_display':
            # helpers.get_version returns a string formatted as: <L|W><version> (L: Linux, W: Windows)
            self.browser = 'chromium-browser' if float(helpers.get_version()[1:]) >= 24.06 else 'firefox'
            self._x_screen = device.get('x_screen', '0')
            self.browser = Browser(
                'http://localhost:8069/point_of_sale/display/' + self.device_identifier,
                self._x_screen,
                self._set_environ(),
            )
            self.browser.close_browser()  # Close the browser if it was already open
            self.update_url(self.load_url())

        self._actions.update({
            'update_url': self._action_update_url,
            'display_refresh': self._action_display_refresh,
            'take_control': self._action_take_control,
            'customer_facing_display': self._action_customer_facing_display,
            'get_owner': self._action_get_owner,
        })

        self.set_orientation(Orientation.NORMAL)

    @classmethod
    def supported(cls, device):
        return True  # All devices with connection_type == 'display' are supported

    @classmethod
    def get_default_display(cls):
        displays = list(filter(lambda d: iot_devices[d].device_type == 'display', iot_devices))
        return len(displays) and iot_devices[displays[0]]

    def run(self):
        while self.device_identifier != 'distant_display' and not self._stopped.is_set():
            time.sleep(60)
            if self.url != 'http://localhost:8069/point_of_sale/display/' + self.device_identifier:
                # Refresh the page every minute
                self.browser.refresh()

    def update_url(self, url=None):
        self.url = url or 'http://localhost:8069/point_of_sale/display/' + self.device_identifier

        if self.browser.open_browser(self.url):
            self.browser.fullscreen()

    def load_url(self):
        url = None
        if helpers.get_odoo_server_url():
            # disable certifiacte verification
            urllib3.disable_warnings()
            http = urllib3.PoolManager(cert_reqs='CERT_NONE')
            try:
                response = http.request(
                    'GET',
                    "%s/iot/box/%s/display_url" % (helpers.get_odoo_server_url(), helpers.get_mac_address())
                )
                if response.status == 200:
                    data = json.loads(response.data.decode('utf8'))
                    url = data[self.device_identifier]
            except json.decoder.JSONDecodeError:
                url = response.data.decode('utf8')
            except Exception:
                pass
        return url

    def update_customer_facing_display(self, origin, html=None):
        if origin == self.owner:
            self.rendered_html = html
            self.event_data.set()

    def get_serialized_order(self):
        # IMPLEMENTATION OF LONGPOLLING
        # Times out 2 seconds before the JS request does
        if self.event_data.wait(28):
            self.event_data.clear()
            return {'rendered_html': self.rendered_html}
        return {'rendered_html': False}

    def take_control(self, new_owner, html=None):
        # ALLOW A CASHIER TO TAKE CONTROL OVER THE POSBOX, IN CASE OF MULTIPLE CASHIER PER DISPLAY
        self.owner = new_owner
        self.rendered_html = html
        self.data = {
            'value': '',
            'owner': self.owner,
        }
        event_manager.device_changed(self)
        self.event_data.set()

    def update_customer_facing_display(self, origin, html=None):
        if origin == self.owner:
            self.rendered_html = html
            self.event_data.set()

    def get_serialized_order(self):
        # IMPLEMENTATION OF LONGPOLLING
        # Times out 2 seconds before the JS request does
        if self.event_data.wait(28):
            self.event_data.clear()
            return {'rendered_html': self.rendered_html}
        return {'rendered_html': False}

    def take_control(self, new_owner, html=None):
        # ALLOW A CASHIER TO TAKE CONTROL OVER THE POSBOX, IN CASE OF MULTIPLE CASHIER PER DISPLAY
        self.owner = new_owner
        self.rendered_html = html
        self.data = {
            'value': '',
            'owner': self.owner,
        }
        event_manager.device_changed(self)
        self.event_data.set()

    def _action_update_url(self, data):
        if self.device_identifier != 'distant_display':
            self.update_url(data.get('url'))

    def _action_display_refresh(self, data):
        if self.device_identifier != 'distant_display':
            self.browser.refresh()

    def _set_environ(self):
        os.environ['DISPLAY'] = ":0." + self._x_screen
        os.environ['XAUTHORITY'] = '/run/lightdm/pi/xauthority'

        return os.environ.copy()

    def set_orientation(self, orientation=Orientation.NORMAL):
        subprocess.run(['xrandr', '-o', orientation.value], check=True)
        subprocess.run([file_path('hw_drivers/tools/sync_touchscreen.sh'), str(int(self._x_screen) + 1)], check=False)


    def _action_take_control(self, data):
        self.take_control(self.data.get('owner'), data.get('html'))

    def _action_customer_facing_display(self, data):
        self.update_customer_facing_display(self.data.get('owner'), data.get('html'))

    def _action_get_owner(self, data):
        self.data = {
            'value': '',
            'owner': self.owner,
        }
        event_manager.device_changed(self)


class DisplayController(http.Controller):
    @http.route('/hw_proxy/display_refresh', type='json', auth='none', cors='*')
    def display_refresh(self):
        display = DisplayDriver.get_default_display()
        if display and display.device_identifier != 'distant_display':
            return display.call_xdotools('F5')

    @http.route('/hw_proxy/customer_facing_display', type='json', auth='none', cors='*')
    def customer_facing_display(self, html=None):
        display = DisplayDriver.get_default_display()
        if display:
            display.update_customer_facing_display(http.request.httprequest.remote_addr, html)
            return {'status': 'updated'}
        return {'status': 'failed'}

    @http.route('/hw_proxy/take_control', type='json', auth='none', cors='*')
    def take_control(self, html=None):
        display = DisplayDriver.get_default_display()
        if display:
            display.take_control(http.request.httprequest.remote_addr, html)
            return {
                'status': 'success',
                'message': 'You now have access to the display',
            }

    @http.route('/hw_proxy/test_ownership', type='json', auth='none', cors='*')
    def test_ownership(self):
        display = DisplayDriver.get_default_display()
        if display and display.owner == http.request.httprequest.remote_addr:
            return {'status': 'OWNER'}
        return {'status': 'NOWNER'}

    @http.route(['/point_of_sale/get_serialized_order', '/point_of_sale/get_serialized_order/<string:display_identifier>'], type='json', auth='none')
    def get_serialized_order(self, display_identifier=None):
        if display_identifier:
            display = iot_devices.get(display_identifier)
        else:
            display = DisplayDriver.get_default_display()

        if display:
            return display.get_serialized_order()
        return {
            'rendered_html': False,
            'error': "No display found",
        }

    @http.route(['/point_of_sale/display', '/point_of_sale/display/<string:display_identifier>'], type='http', auth='none')
    def display(self, display_identifier=None):
        cust_js = None
        interfaces = ni.interfaces()

        with file_open("hw_drivers/static/src/js/worker.js") as js:
            cust_js = js.read()

        display_ifaces = []
        for iface_id in interfaces:
            if 'wlan' in iface_id or 'eth' in iface_id:
                iface_obj = ni.ifaddresses(iface_id)
                ifconfigs = iface_obj.get(ni.AF_INET, [])
                essid = helpers.get_ssid()
                for conf in ifconfigs:
                    if conf.get('addr'):
                        display_ifaces.append({
                            'iface_id': iface_id,
                            'essid': essid,
                            'addr': conf.get('addr'),
                            'icon': 'sitemap' if 'eth' in iface_id else 'wifi',
                        })

        if not display_identifier and (default_display := DisplayDriver.get_default_display()) != 0:
            display_identifier = default_display.device_identifier

        return pos_display_template.render({
            'title': "Odoo -- Point of Sale",
            'breadcrumb': 'POS Client display',
            'cust_js': cust_js,
            'display_ifaces': display_ifaces,
            'display_identifier': display_identifier,
            'pairing_code': connection_manager.pairing_code,
            'hostname': helpers.get_hostname(),
        })

    @http.route('/point_of_sale/iot_devices', type='json', auth='none', methods=['POST'])
    def get_iot_devices(self):
        iot_device = [{
            'name': iot_devices[device].device_name,
            'type': iot_devices[device].device_type,
        } for device in iot_devices]

        return json.dumps({'iot_device_status': iot_device})

    @http.route('/kiosk/display', type='json', auth='none', methods=['POST'])
    def kiosk_display(self, pos_id, access_token):
        if not pos_id or not access_token:
            return json.dumps({'status': 'failed', 'message': 'No id or access_token provided'})

        display: DisplayDriver = DisplayDriver.get_default_display()
        if not display:
            return json.dumps({'status': 'failed', 'message': 'No display found'})

        uri = f'{helpers.get_odoo_server_url()}/pos-self/{pos_id}?access_token={access_token}'

        display.set_orientation(Orientation.RIGHT)  # default orientation for kiosk mode
        display.update_url(uri)
        display.browser.enable_kiosk_mode()

        return json.dumps({'status': 'success'})

    @http.route(['/hw_proxy/display_pos_display'], type='http', auth='none')
    def display_pos_display(self):
        """Display the POS display on the screen: may be useful for debugging purposes?"""
        display: DisplayDriver = DisplayDriver.get_default_display()
        if not display:
            return json.dumps({'status': 'failed', 'message': 'No display found'})

        display.update_url(display.load_url())
        display.browser.disable_kiosk_mode()

        return json.dumps({'status': 'success'})

    @http.route(['/hw_proxy/rotate_screen'], type='json', auth='none', methods=['POST'])
    def rotate_screen(self, orientation=Orientation.NORMAL):
        """Rotate screen: use by 'iot.box' model when is_kiosk is checked"""
        display: DisplayDriver = DisplayDriver.get_default_display()
        if not display:
            return json.dumps({'status': 'failed', 'message': 'No display found'})

        display.set_orientation(Orientation(orientation))
        return json.dumps({'status': 'success'})
