# -*- coding: utf-8 -*-

from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = 'pos.order'

    fiskaly_transaction_uuid = fields.Char(string="Transaction ID", readonly=True, copy=False)
    fiskaly_transaction_number = fields.Integer(string="Transaction number", readonly=True, copy=False)
    fiskaly_time_start = fields.Datetime(string="Beginning", readonly=True, copy=False)
    fiskaly_time_end = fields.Datetime(string="End", readonly=True, copy=False)
    fiskaly_certificate_serial = fields.Char(string="Certificate serial", readonly=True, copy=False)
    fiskaly_timestamp_format = fields.Char(string="Timestamp format", readonly=True, copy=False)
    fiskaly_signature_value = fields.Char(string="Signature value", readonly=True, copy=False)
    fiskaly_signature_algorithm = fields.Char(string="Signature algo", readonly=True, copy=False)
    fiskaly_signature_public_key = fields.Char(string="Signature public key", readonly=True, copy=False)
    fiskaly_client_serial_number = fields.Char(string="Client serial", readonly=True, copy=False)

    @api.model
    def _order_fields(self, ui_order):
        fields = super(PosOrder, self)._order_fields(ui_order)
        if self.env.company.country_id == self.env.ref('base.de'):
            fields['fiskaly_transaction_uuid'] = ui_order['fiskaly_uuid']
            if 'tss_info' in ui_order:
                for key, value in ui_order['tss_info'].items():
                    if value:
                        fields['fiskaly_'+key] = value
        return fields
