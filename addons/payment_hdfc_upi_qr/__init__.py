# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers
from . import models

from odoo.addons.payment import setup_provider, reset_payment_provider
import logging

_logger = logging.getLogger(__name__)


def post_init_hook(env):
    _logger.info("Initializing HDFC UPI QR payment provider")
    setup_provider(env, 'hdfc_upi')
    _logger.info("HDFC UPI QR payment provider initialized successfully")


def uninstall_hook(env):
    _logger.info("Uninstalling HDFC UPI QR payment provider")
    reset_payment_provider(env, 'hdfc_upi')
    _logger.info("HDFC UPI QR payment provider uninstalled successfully")
