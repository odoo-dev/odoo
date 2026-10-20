# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class PosPaymentTerminal(models.Model):
    _inherit = 'pos.payment.terminal'

    dpopay_tid = fields.Char(string='DPO Pay Terminal ID', help="Enter the unique Terminal ID (TID) of your DPO Pay POS terminal (e.g., XXXXXXXX).")
