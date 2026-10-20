# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class PosPaymentTerminal(models.Model):
    _inherit = 'pos.payment.terminal'

    viva_com_terminal_id = fields.Char(string="Terminal ID", help='[ID of the Viva.com terminal], e.g. 16002169')
