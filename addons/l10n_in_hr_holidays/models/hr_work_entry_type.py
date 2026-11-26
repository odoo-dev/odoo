# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class HrWorkEntryType(models.Model):
    _inherit = "hr.work.entry.type"

    l10n_in_is_sandwich_leave = fields.Boolean(
        string="Is Sandwich Leave",
        help="""If a leave is covering holidays, the holiday period will be included in the requested time.
        The time took in addition will have the same treatment (allocation, pay, reports) as the initial request.
        Holidays includes public holidays, national days, paid holidays and week-ends.""")
    l10n_in_sandwich_policy = fields.Selection(
        selection=[
            ("full", "Weekends and Company holidays"),
            ("weekend", "Weekends Only"),
            ("public_holiday", "Company holidays Only"),
        ],
        string="Sandwich Leave Policy",
        default="full",
        help="""Weekends and Company holidays – Count both weekends and company holidays between two leave days.
        Weekends Only – Apply only if weekends fall between leave days.
        Company holidays Only – Apply only if public holidays fall between leave days.""")
    l10n_in_sandwich_work_entry_type_id = fields.Many2one(
        "hr.work.entry.type",
        string="Sandwich Days Type",
        compute="_compute_l10n_in_sandwich_work_entry_type_id",
        store=True,
        readonly=False,
        domain=[("time_off_selectable", "=", False)],
        help="""Type of the work entries of the non-working days counted by the sandwich policy: its rate
        decides how they are paid. By default, they are not paid for a paid time off, and deducted
        from the salary for an unpaid one.""")
    l10n_in_is_limited_to_optional_days = fields.Boolean(
        string="Is Limited To Optional Days",
        help="""Enable this option to restrict Flexi Leave to specific days, ensuring that only days marked as
        Optional Holidays can be selected. This helps validate that employees can only choose days from the designated
        Optional Holiday list for their Flexi Leave.""")

    @api.depends("l10n_in_is_sandwich_leave", "amount_rate")
    def _compute_l10n_in_sandwich_work_entry_type_id(self):
        paid_type = self.env.ref("l10n_in_hr_holidays.work_entry_type_sandwich_paid", raise_if_not_found=False)
        unpaid_type = self.env.ref("l10n_in_hr_holidays.work_entry_type_sandwich_unpaid", raise_if_not_found=False)
        for work_entry_type in self:
            if not work_entry_type.l10n_in_is_sandwich_leave:
                work_entry_type.l10n_in_sandwich_work_entry_type_id = False
            elif not work_entry_type.l10n_in_sandwich_work_entry_type_id:
                work_entry_type.l10n_in_sandwich_work_entry_type_id = paid_type if work_entry_type.amount_rate else unpaid_type
