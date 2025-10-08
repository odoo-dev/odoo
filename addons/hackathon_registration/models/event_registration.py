from odoo import api, fields, models


class EventRegistration(models.Model):
    _inherit = 'event.registration'

    state = fields.Selection(
        selection_add=[('qualified', 'Qualified'), ('1st_round', '1st Round'), ('2nd_round', '2nd Round'), ('won', 'Won')])
    stage_id = fields.Many2one('event.registration.stage', string='Stage')
    stage_ids = fields.Many2many(
        'event.registration.stage', string='Stage Filters', compute="_compute_stage_ids", store=True)

    @api.depends('event_id.event_type_id.event_registration_stage_ids')
    def _compute_stage_ids(self):
        for record in self:
            record.stage_ids = [(5,)]
            if record.event_id.event_type_id.event_registration_stage_ids:
                record.stage_ids = [
                    (6, 0, record.event_id.event_type_id.event_registration_stage_ids.ids)]
