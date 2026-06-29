# -*- coding: utf-8 -*-
from odoo import api, models

class PosOrderReceipt(models.AbstractModel):
    _inherit = 'pos.order.receipt'

    @api.model
    def get_receipt_template_for_pos_frontend(self):
        templates = super().get_receipt_template_for_pos_frontend()
        custom_template = 'pos_zpl_labels.pos_product_label_zpl'
        template_content = self.env['ir.qweb']._get_template(custom_template)[1]
        templates.append([custom_template, template_content])
        return templates
