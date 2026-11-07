# -*- coding: utf-8 -*-

from odoo import models, fields


class ResCompany(models.Model):
    _inherit = 'res.company'

    _barcodes__default_barcode_nomenclature = models.Ref('barcodes.default_barcode_nomenclature', 'barcode.nomenclature', required=False)

    def _get_default_nomenclature(self):
        return self._barcodes__default_barcode_nomenclature

    nomenclature_id = fields.Many2one(
        'barcode.nomenclature',
        string="Nomenclature",
        default=_get_default_nomenclature,
    )
