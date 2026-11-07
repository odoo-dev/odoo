# -*- coding: utf-8 -*-

from odoo import models, fields


class ResCompany(models.Model):
    _inherit = 'res.company'

    def _get_default_nomenclature(self):
        return self.env['barcode.nomenclature']._barcodes__default_barcode_nomenclature

    nomenclature_id = fields.Many2one(
        'barcode.nomenclature',
        string="Nomenclature",
        default=_get_default_nomenclature,
    )
