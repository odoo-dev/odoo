# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from threading import Thread, Event

from odoo.addons.hw_drivers.main import drivers, iot_devices


class Driver(Thread):
    """
    Hook to register the driver into the drivers list
    """
    connection_type = ''

    def __init__(self, identifier, device):
        super(Driver, self).__init__()
        self.dev = device
        self.device_identifier = identifier
        self.device_name = ''
        self.device_connection = ''
        self.device_type = ''
        self.device_manufacturer = ''
        self.data = {'value': ''}
        self._actions = {}
        self._stopped = Event()

    def __init_subclass__(cls):
        super().__init_subclass__()
        if hasattr(cls, 'priority'):
            cls.priority += 1
        else:
            cls.priority = 0
        drivers.append(cls)

    @classmethod
    def supported(cls, device):
        """
        On specific driver override this method to check if device is supported or not
        return True or False
        """
        return False

    def action(self, data):
        """Helper function that calls a specific action method on the device.

        :param data: the `_actions` key mapped to the action method we want to call
        :type data: string
        """
        self._actions[data.get('action', '')](data)

    def disconnect(self):
        self._stopped.set()
        del iot_devices[self.device_identifier]
