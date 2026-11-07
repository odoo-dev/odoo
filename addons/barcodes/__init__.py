# -*- coding: utf-8 -*-

from . import models


def _assign_default_nomeclature_id(env):
    company_ids_without_default_nomenclature_id  = env['res.company'].search([
        ('nomenclature_id', '=', False)
    ])
    company_ids_without_default_nomenclature_id.write({
        'nomenclature_id': env['barcode.nomenclature']._barcodes__default_barcode_nomenclature.id,
    })
