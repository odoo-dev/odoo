# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class LoyaltyProgram(models.Model):
    _name = 'loyalty.program'
    _inherit = ['loyalty.program', 'pos.load.mixin']

    # NOTE: `pos_config_ids` satisfies an excpeptional use case: when no PoS is specified, the loyalty program is
    # applied to every PoS. You can access the loyalty programs of a PoS using _get_program_ids() of pos.config
    pos_config_ids = fields.Many2many('pos.config', compute="_compute_pos_config_ids", store=True, readonly=False, string="Point of Sales", help="Restrict publishing to those shops. Note: A program will only be used in the shops using the same currency as the program.")
    pos_order_count = fields.Integer("PoS Order Count", compute='_compute_pos_order_count')
    pos_ok = fields.Boolean("Point of Sale", default=True)
    pos_report_print_id = fields.Many2one('ir.actions.report', string="Print Report", domain=[('model', '=', 'loyalty.card')], compute='_compute_pos_report_print_id', inverse='_inverse_pos_report_print_id', readonly=False,
        help="This is used to print the generated gift cards from PoS.")

    @api.model
    def _load_pos_data_domain(self, data, config):
        return [('id', 'in', config._get_program_ids().ids)]

    @api.model
    def _load_pos_data_fields(self, config):
        return [
            'name', 'trigger', 'applies_on', 'program_type', 'pricelist_ids', 'date_from',
            'date_to', 'limit_usage', 'max_usage', 'total_order_count', 'is_nominative',
            'portal_visible', 'portal_point_name', 'trigger_product_ids', 'rule_ids', 'reward_ids'
        ]

    @api.model
    def _load_pos_data_read(self, records, config):
        return super()._load_pos_data_read(records.sudo(), config)

    def _unrelevant_records(self, config):
        valid_record = config._get_program_ids()
        return self.filtered(lambda record: record.id not in valid_record.ids).ids

    @api.depends("communication_plan_ids.pos_report_print_id")
    def _compute_pos_report_print_id(self):
        for program in self:
            program.pos_report_print_id = program.communication_plan_ids.pos_report_print_id[:1]

    def _inverse_pos_report_print_id(self):
        to_create = []
        for program in self:
            if program.program_type not in ("gift_card", "ewallet") or not program.pos_report_print_id:
                continue

            if not program.mail_template_id:
                mail_template_label = program._fields.get('mail_template_id').get_description(self.env)['string']
                pos_report_print_label = program._fields.get('pos_report_print_id').get_description(self.env)['string']
                raise UserError(_(
                    "You must set '%(mail_template)s' before setting '%(report)s'.",
                    mail_template=mail_template_label,
                    report=pos_report_print_label,
                ))
            if not program.communication_plan_ids:
                to_create.append({
                    'program_id': program.id,
                    'trigger': 'create',
                    'mail_template_id': program.mail_template_id.id,
                    'pos_report_print_id': program.pos_report_print_id.id,
                })
            else:
                program.communication_plan_ids.write({
                    'trigger': 'create',
                    'pos_report_print_id': program.pos_report_print_id.id,
                })
        if to_create:
            self.env['loyalty.mail'].create(to_create)

    @api.depends('pos_ok')
    def _compute_pos_config_ids(self):
        for program in self:
            if not program.pos_ok:
                program.pos_config_ids = False

    def _compute_pos_order_count(self):
        query = """
            SELECT reward.program_id, COUNT(DISTINCT line.order_id)
            FROM pos_order_line line
            JOIN loyalty_reward reward ON reward.id = line.reward_id
            WHERE reward.program_id = ANY(%s)
            GROUP BY reward.program_id
        """
        self.env.cr.execute(query, (self.ids,))
        res = {row[0]: row[1] for row in self.env.cr.fetchall()}

        for rec in self:
            rec.pos_order_count = res.get(rec.id, 0)

    def _compute_total_order_count(self):
        super()._compute_total_order_count()
        for program in self:
            program.total_order_count += program.pos_order_count
