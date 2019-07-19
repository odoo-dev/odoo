# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json

from odoo.addons.hw_drivers.interface import Interface
from odoo.addons.hw_drivers.tools import helpers


class OPCUAInterface(Interface):
    _loop_delay = 0
    connection_type = 'opcua'

    def get_devices(self):
        opcua_devices = {}
        opcua_server = helpers.read_file_first_line('odoo-opcua-server.conf')
        if opcua_server:
            opcua_device = json.loads(opcua_server)
            opcua_devices[opcua_device.get('endpoint')] = opcua_device
        return opcua_devices
