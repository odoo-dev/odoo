# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, fields, models


class CrmTeam(models.Model):
    _inherit = ['crm.team']

    website_ids = fields.One2many(
        string="Websites", comodel_name='website', inverse_name='salesteam_id',
    )
    abandoned_carts_amount = fields.Integer(
        string="Amount of Abandoned Carts", compute='_compute_abandoned_carts',
    )
    abandoned_carts_count = fields.Integer(
        string="Number of Abandoned Carts", compute='_compute_abandoned_carts',
    )

    def _compute_abandoned_carts(self):
        # abandoned carts to recover are draft sales orders that have no order lines,
        # a partner other than the public user, and created over an hour ago
        # and the recovery mail was not yet sent
        website_teams = self.filtered(lambda team: team.website_ids)
        abandoned_carts_data = self.env['sale.order']._read_group([
            ('is_abandoned_cart', '=', True),
            ('cart_recovery_email_sent', '=', False),
            ('team_id', 'in', website_teams.ids),
        ], ['team_id'], ['amount_total:sum', '__count'])
        counts = {team.id: count for team, __, count in abandoned_carts_data}
        amounts = {team.id: amount_total_sum for team, amount_total_sum, __ in abandoned_carts_data}
        for team in self:
            team.abandoned_carts_count = counts.get(team.id, 0)
            team.abandoned_carts_amount = amounts.get(team.id, 0)

    def get_abandoned_carts(self):
        self.ensure_one()
        return {
            'name': _('Abandoned Carts'),
            'type': 'ir.actions.act_window',
            'view_mode': 'list,form',
            'domain': [('is_abandoned_cart', '=', True)],
            'search_view_id': [self.env.ref('sale.sale_order_view_search_inherit_sale').id],
            'context': {
                'search_default_team_id': self.id,
                'default_team_id': self.id,
                'search_default_recovery_email': 1,
                'create': False
            },
            'res_model': 'sale.order',
            'help': _('''<p class="o_view_nocontent_smiling_face">
                        You can find all abandoned carts here, i.e. the carts generated by your website's visitors from over an hour ago that haven't been confirmed yet.</p>
                        <p>You should send an email to the customers to encourage them!</p>
                    '''),
        }
