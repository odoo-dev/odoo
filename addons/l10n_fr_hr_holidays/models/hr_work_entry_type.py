from odoo import models


class HrWorkEntryType(models.Model):
    _inherit = 'hr.work.entry.type'

    _hr_holidays__l10n_fr_work_entry_type_paid_time_off = models.Ref('hr_holidays.l10n_fr_work_entry_type_paid_time_off', required=False)
