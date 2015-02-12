# -*- coding: utf-8 -*-

from openerp import api, fields, models, _
from openerp.exceptions import UserError

class sale_configuration(models.TransientModel):
    _inherit = 'sale.config.settings'

   
    group_template_required = fields.Boolean(string="Mandatory use of templates.",
        implied_group='account_analytic_analysis.group_template_required',
        help="Allows you to set the template field as required when creating an analytic account or a contract.")
    time_unit = fields.Many2one('product.uom', string='The default working time unit.')
    
    @api.model
    def default_get(self, fields):
        res = super(sale_configuration, self).default_get(fields)
        if res.get('module_project'):
            res['time_unit'] = self.env.user.company_id.project_time_mode_id.id
        else:
            product = self.env.ref('product.product_product_consultant')
            if product and product.exists():
                res['time_unit'] = product.uom_id.id
        res['timesheet'] = res.get('module_account_analytic_analysis')
        return res

    @api.one
    def set_sale_defaults(self):
        if self.time_unit:
            product = self.env.ref('product.product_product_consultant')
            if product and product.exists():
                product.write({'uom_id': self.time_unit.id, 'uom_po_id': self.time_unit.id})
            else:
                _logger.info("Product with xml_id 'product.product_product_consultant' not found, UoMs not updated!")
                raise UserError(_("Product with xml_id 'product.product_product_consultant' not found, UoMs not updated!"))

        if self.module_project and self.time_unit:
            self.env.user.company_id.project_time_mode_id = self.time_unit.id
        res = super(sale_configuration, self).set_sale_defaults()
        return res
