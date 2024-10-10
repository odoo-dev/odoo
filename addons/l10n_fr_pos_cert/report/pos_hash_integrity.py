# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ReportL10n_Fr_Pos_CertReport_Pos_Hash_Integrity(models.AbstractModel):
    _description = 'Get french pos hash integrity result as PDF.'

    @api.model
    def _get_report_values(self, docids, data=None):
        data = data or {}
        data.update(self.env.company._check_pos_hash_integrity() or {})
        return {
            'doc_ids' : docids,
            'doc_model' : self.env['res.company'],
            'data' : data,
            'docs' : self.env['res.company'].browse(self.env.company.id),
        }
