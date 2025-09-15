from odoo import api, models


class CrmTeam(models.Model):
    _inherit = 'crm.team'

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if 'company_id' not in vals or not vals['company_id']:
                vals['company_id'] = self.env.company.id
        return super().create(vals_list)
