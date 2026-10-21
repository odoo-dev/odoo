# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models

# Without this module, posted practice invoices could not be brought back to
# draft anymore: remove the practice sales documents while it is still there.
SALES_MODELS = ('account.payment', 'account.move', 'sale.order', 'account.journal', 'account.account')


def uninstall_hook(env):
    env['learning.practice.record'].sudo().search([('res_model', 'in', SALES_MODELS)])._cleanup()
