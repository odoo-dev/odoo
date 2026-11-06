# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from odoo.tools.sql import column_exists, create_column


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    l10n_es_employee_id = fields.Many2one(
        comodel_name='hr.employee',
        string="Employee",
        check_company=True,
        index='btree_not_null',
        help="Employee receiving this salary. Their IRPF withholding rate is applied on the salary "
             "withholding taxes of this journal item.",
    )
    l10n_es_irpf_rate = fields.Float(
        string="IRPF Rate (%)",
        digits=(5, 2),
        compute='_compute_l10n_es_irpf_rate',
        store=True,
        help="Personal IRPF withholding rate of the employee applied on this journal item. It is kept on the "
             "journal item, so a later change of the employee's rate does not alter this entry.",
    )

    def _auto_init(self):
        # Avoid computing the field on all the existing journal items at installation:
        # none of them has an employee yet, so they all keep the default value.
        if not column_exists(self.env.cr, 'account_move_line', 'l10n_es_irpf_rate'):
            create_column(self.env.cr, 'account_move_line', 'l10n_es_irpf_rate', 'numeric')
        return super()._auto_init()

    @api.depends('l10n_es_employee_id')
    def _compute_partner_id(self):
        # EXTENDS 'account'
        super()._compute_partner_id()
        # The employee's contact identifies the recipient of the salary (needed for the mod190).
        for line in self.filtered('l10n_es_employee_id'):
            line.partner_id = line.l10n_es_employee_id.work_contact_id

    @api.depends('l10n_es_employee_id', 'tax_ids')
    def _compute_l10n_es_irpf_rate(self):
        for line in self:
            taxes = line.tax_ids | line.tax_ids.children_tax_ids
            if line.l10n_es_employee_id and taxes.filtered('l10n_es_irpf_partner_rate'):
                line.l10n_es_irpf_rate = line.l10n_es_employee_id.l10n_es_irpf_rate
            else:
                line.l10n_es_irpf_rate = 0.0