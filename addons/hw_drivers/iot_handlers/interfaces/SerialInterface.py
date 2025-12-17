# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import platform
from serial.tools.list_ports import comports

from odoo.addons.hw_drivers.interface import Interface


class SerialInterface(Interface):
    connection_type = 'serial'

    def _get_serial_identifier(self, port):
        """
        Generate a more user-friendly identifier for serial devices
        based on their manufacturer and serial number when available.
        Avoids recreating a device when the usb port changes
        Example: METTLER-TOLEDO-Ser_CDC instead of /dev/ttyUSB0
        """
        if port.manufacturer and port.serial_number:
            return (port.manufacturer + "-" + port.serial_number).replace(' ', '-')
        return port.device

    def get_devices(self):
        serial_devices = {
            port.device: {'identifier': self._get_serial_identifier(port)}
            for port in comports()
            if platform.system() == 'Windows' or port.device != '/dev/ttyAMA10'
            # RPI 5 uses ttyAMA10 as a console serial port for system messages: odoo interprets it as scale -> avoid it
        }
        return serial_devices
