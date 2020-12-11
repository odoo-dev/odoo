# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging

from odoo.addons.hw_drivers.interface import Interface
from odoo.addons.hw_drivers.tools import helpers

_logger = logging.getLogger(__name__)


class OPCUAInterface(Interface):
    _loop_delay = 0
    connection_type = 'opcua'

    def get_devices(self):
        opcua_servers = helpers.read_file_first_line('odoo-opcua-server.conf')
        return json.loads(opcua_servers) if opcua_servers else {}
