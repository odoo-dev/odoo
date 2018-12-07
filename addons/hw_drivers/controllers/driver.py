#!/usr/bin/python3
import logging
import time
import usb
import gatt
import netifaces
import json
import os
import socket
import importlib.util
from odoo import http, _
import urllib3
import threading
import v4l2
import fcntl
import cups
import glob
import subprocess
from odoo.http import request as httprequest
import re

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
_logger = logging.getLogger('dispatcher')


#----------------------------------------------------------
# Helper
#----------------------------------------------------------

def get_hostname():
    return socket.gethostname()

def get_mac_address():
    try:
        return netifaces.ifaddresses('eth0')[netifaces.AF_LINK][0]['addr']
    except:
        return netifaces.ifaddresses('wlan0')[netifaces.AF_LINK][0]['addr']

def get_ip():
    try:
        return netifaces.ifaddresses('eth0')[netifaces.AF_INET][0]['addr']
    except:
        return netifaces.ifaddresses('wlan0')[netifaces.AF_INET][0]['addr']

def read_file_first_line(filename):
    content = ""
    try:
        f = open('/home/pi/' + filename, 'r')
        content = f.readline().strip('\n')
        f.close()
    finally:
        return content

def get_odoo_server_url():
    return read_file_first_line('odoo-remote-server.conf')

def get_token():
    return read_file_first_line('token')


#----------------------------------------------------------
# Controllers
#----------------------------------------------------------

class StatusController(http.Controller):
    @http.route('/hw_drivers/action', type='json', auth='none', cors='*', csrf=False)
    def action(self, device_id, data):
        if device_id in all_devices:
            return all_devices[device_id].action(data)
        else:
            return {'message': _('Device %s not found' % device_id)}

    @http.route('/hw_drivers/event', type='json', auth='none', cors='*', csrf=False)
    def event(self, requests):
        req = DeviceManager.addRequest(requests)
        if req['event'].wait(58):
            req['event'].clear()
            return_value = req['queue'].copy()
            return return_value

    @http.route('/hw_drivers/box/connect', type='json', auth='none', cors='*', csrf=False)
    def connect_box(self, token):
        server = get_odoo_server_url()
        if server:
            return _('This IoTBox has already been connected')
        else:
            iotname = ''
            url = token.split('|')[0]
            token = token.split('|')[1]
            reboot = 'noreboot'
            subprocess.call(['/home/pi/odoo/addons/point_of_sale/tools/posbox/configuration/connect_to_server.sh', url, iotname, token, reboot])
            m.send_alldevices()
            return _('IoTBox connected')

#----------------------------------------------------------
# Drivers
#----------------------------------------------------------

drivers = []
bt_devices = {}
all_devices = {}

class MetaClass(type):
    def __new__(cls, clsname, bases, attrs):
        newclass = super(MetaClass, cls).__new__(cls, clsname, bases, attrs)
        drivers.append(newclass)
        return newclass

class Driver(threading.Thread, metaclass=MetaClass):
    connection_type = ""

    def __init__(self, device, manager):
        super(Driver, self).__init__()
        self.dev = device
        self.manager = manager
        self.value = ""
        self.data = ""
        self.gatt_device = False

    def get_name(self):
        return ''

    def get_identifier(self):
        return ''

    def get_connection(self):
        return ''

    def get_message(self):
        return ''

    def value(self):
        return self.value

    def supported(self):
        pass

    def action(self, action):
        pass

    def disconnect(self):
        del all_devices[self.get_identifier()]


#----------------------------------------------------------
# Device manager
#----------------------------------------------------------

class DeviceManager():
    sessions = []

    def addRequest(self, requests):
        session = {
            'requests': requests,
            'event': threading.Event(),
            'queue': [],
        }
        self.sessions.append(session)
        return session

    def deviceChanged(self, device):
        for session in self.sessions:
            for req in session['requests']:
                if device.get_identifier() == req.get('device_id'):
                    session['queue'].append({
                        'request_id': req.get('request_id'),
                        'value': device.value,
                        'data': device.data,
                    })
                    session['event'].set()

class IoTDevice(object):
    pass

DeviceManager = DeviceManager()


#----------------------------------------------------------
# Manager
#----------------------------------------------------------

class Manager(threading.Thread):

    def __init__(self):
        super(Manager, self).__init__()
        self.load_drivers()

    def load_drivers(self): # Load drivers from IoT Box
        driversList = os.listdir("/home/pi/odoo/addons/hw_drivers/drivers")
        for driver in driversList:
            path = "/home/pi/odoo/addons/hw_drivers/drivers/" + driver
            spec = importlib.util.spec_from_file_location(driver, path)
            if spec:
                foo = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(foo)

    def send_alldevices(self): # Send device to Odoo
        server = get_odoo_server_url()
        if server:
            iot_box = {'name': get_hostname(),'identifier': get_mac_address(), 'ip': get_ip(), 'token': get_token()}
            devices_list = {}
            for device in all_devices:
                identifier = all_devices[device].get_identifier()
                devices_list[identifier] = {
                    'name': all_devices[device].get_name(),
                    'type': all_devices[device].get_type(),
                    'connection': all_devices[device].get_connection(),
                }
            data = {
                'params': {
                    'iot_box' : iot_box,
                    'devices' : devices_list,
                }
            }
            try:
                req = urllib3.PoolManager().request(
                    'POST',
                    server + "/iot/setup",
                    body = json.dumps(data).encode('utf8'),
                    headers = {'Content-type': 'application/json', 'Accept': 'text/plain'}
                )
            except:
                _logger.warning('Could not reach configured server')
        else:
            _logger.warning('Odoo server not set')


    def usb_loop(self):
        usb_devices = {}
        devs = usb.core.find(find_all=True)
        for dev in devs:
            path =  "usb_%04x:%04x_%03d_%03d_" % (dev.idVendor, dev.idProduct, dev.bus, dev.address)
            iot_device = IoTDevice()
            iot_device.dev = dev
            iot_device.connection_type = 'usb'
            usb_devices[path] = iot_device
        return usb_devices

    def video_loop(self):
        camera_devices = {}
        videos = glob.glob('/dev/video*')
        for video in videos:
            vd = open(video, 'w')
            cp = v4l2.v4l2_capability()
            fcntl.ioctl(vd, v4l2.VIDIOC_QUERYCAP, cp)
            cp.interface = video
            iot_device = IoTDevice()
            iot_device.dev = cp
            iot_device.connection_type = 'video'
            camera_devices[cp.bus_info.decode('utf-8')] = iot_device
        return camera_devices

    def printer_loop(self):
        printer_devices = {}
        printers = conn.getDevices()
        for path in [printer_lo for printer_lo in printers if printers[printer_lo]['device-id']]:
            if 'uuid=' in path:
                serial = re.sub('[^a-zA-Z0-9 ]+', '', path.split('uuid=')[1])
            elif 'serial=' in path:
                serial = re.sub('[^a-zA-Z0-9 ]+', '', path.split('serial=')[1])
            else:
                serial = re.sub('[^a-zA-Z0-9 ]+', '', path)
            printers[path]['identifier'] = serial
            printers[path]['url'] = path
            iot_device = IoTDevice()
            iot_device.dev = printers[path]
            iot_device.connection_type = 'printer'
            printer_devices[serial] = iot_device
        return printer_devices

    def display_loop(self):
        display_devices = {}
        hdmi = subprocess.check_output('tvservice -n', shell=True).decode('utf-8')
        if hdmi.find('=') != -1:
            hdmi_serial = re.sub('[^a-zA-Z0-9 ]+', '', hdmi.split('=')[1]).replace(' ','_')
            iot_device = IoTDevice()
            iot_device.dev = hdmi_serial
            iot_device.connection_type = 'display'
            display_devices[hdmi_serial] = iot_device
        return display_devices

    def run(self):
        devices = {}
        updated_devices = {}
        self.send_alldevices()
        while 1:
            updated_devices = self.usb_loop()
            updated_devices.update(self.video_loop())
            updated_devices.update(self.printer_loop())
            updated_devices.update(self.display_loop())
            updated_devices.update(bt_devices)
            added = updated_devices.keys() - devices.keys()
            removed = devices.keys() - updated_devices.keys()
            devices = updated_devices
            for path in [device_rm for device_rm in removed if device_rm in all_devices]:
                all_devices[path].disconnect()
                self.send_alldevices()
            for path in [device_add for device_add in added if device_add not in all_devices]:
                for driverclass in [d for d in drivers if d.connection_type == devices[path].connection_type]:
                    d = driverclass(device = updated_devices[path].dev, manager=self)
                    if d.supported():
                            _logger.info('For device %s will be driven', path)
                            all_devices[path] = d
                            self.send_alldevices()
            time.sleep(3)

class GattBtManager(gatt.DeviceManager):

    def device_discovered(self, device):
        path = "bt_%s" % (device.mac_address,)
        if path not in bt_devices:
            device.manager = self
            iot_device = IoTDevice()
            iot_device.dev = device
            iot_device.connection_type = 'bluetooth'
            bt_devices[path] = iot_device

class BtManager(threading.Thread):
    gatt_manager = False

    def run(self):
        dm = GattBtManager(adapter_name='hci0')
        self.gatt_manager = dm
        for device in [device_con for device_con in dm.devices() if device_con.is_connected()]:
            device.disconnect()
        dm.start_discovery()
        dm.run()


conn = cups.Connection()
PPDs = conn.getPPDs()

m = Manager()
m.daemon = True
m.start()

bm = BtManager()
bm.daemon = True
bm.start()
