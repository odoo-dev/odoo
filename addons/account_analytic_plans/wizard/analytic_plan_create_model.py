# -*- coding: utf-8 -*-

from openerp import api, models, _
from openerp.exceptions import UserError


class AnalyticPlanCreateModel(models.TransientModel):
    _name = "analytic.plan.create.model"
    _description = "analytic.plan.create.model"

    @api.multi
    def activate(self):
        plan_obj = self.env['account.analytic.plan.instance']
        mod_obj = self.env['ir.model.data']
        anlytic_plan_obj = self.env['account.analytic.plan']

        if self.env.context.get('active_id'):
            plan_id = self.env.context['active_id']
            plan = plan_obj.browse(plan_id)
            if (not plan.name) or (not plan.code):
                raise UserError(_('Please put a name and a code before saving the model.'))
            pids = anlytic_plan_obj.search([])
            if not pids:
                raise UserError(_('There is no analytic plan defined.'))
            plan.write({'plan_id': pids[0]})

            model_data_ids = mod_obj.search([('model', '=', 'ir.ui.view'), ('name', '=', 'view_analytic_plan_create_model')])
            resource_id = mod_obj.read(model_data_ids, fields=['res_id'])[0]['res_id']
            return {
                'name': _('Distribution Model Saved'),
                'view_type': 'form',
                'view_mode': 'tree,form',
                'res_model': 'analytic.plan.create.model',
                'views': [(resource_id, 'form')],
                'type': 'ir.actions.act_window',
                'target': 'new',
            }
        else:
            return {'type': 'ir.actions.act_window_close'}
