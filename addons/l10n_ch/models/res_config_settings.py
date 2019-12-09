# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_ch_isr_preprinted_account = fields.Boolean(string='Preprinted account',
        related="company_id.l10n_ch_isr_preprinted_account", readonly=False)
    l10n_ch_isr_preprinted_bank = fields.Boolean(string='Preprinted bank',
        related="company_id.l10n_ch_isr_preprinted_bank", readonly=False)
    l10n_ch_isr_print_bank_location = fields.Boolean(string="Print bank on ISR",
        related="company_id.l10n_ch_isr_print_bank_location", readonly=False,
        required=True)
    l10n_ch_isr_scan_line_left = fields.Float(string='Horizontal offset',
        related="company_id.l10n_ch_isr_scan_line_left", readonly=False)
    l10n_ch_isr_scan_line_top = fields.Float(string='Vertical offset',
        related="company_id.l10n_ch_isr_scan_line_top", readonly=False)
    l10n_ch_isr_margin_left = fields.Float(string='Horizontal margin',
        related="company_id.l10n_ch_isr_margin_left", readonly=False)
    l10n_ch_isr_margin_top = fields.Float(string='Vertical margin',
        related="company_id.l10n_ch_isr_margin_top", readonly=False)
    l10n_ch_print_qrcode = fields.Boolean("Print Swiss QR Code", config_parameter='l10n_ch.print_qrcode')
