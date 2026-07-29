from odoo import models
from odoo.tools import date_utils

from dateutil.relativedelta import relativedelta

from bisect import bisect_left


class ResCompany(models.Model):
    _inherit = 'res.company'

    def _get_fiscalyear_intervals(self, date_start, date_end, date_from=None):
        intervals = []

        get_fiscal_year = lambda current_date: date_utils.get_fiscal_year(
            current_date,
            day=self.fiscalyear_last_day,
            month=int(self.fiscalyear_last_month)
        )

        date_from, date_to = get_fiscal_year(date_start)
        intervals.append(date_from)
        while (date_to <= date_end):
            date_from, date_to = get_fiscal_year(date_to + relativedelta(days=1))
            intervals.append(date_from)

        intervals.append(date_to + relativedelta(days=1))

        if date_from:
            date_from_index = bisect_left(intervals, date_from)
            intervals[date_from_index:] = [date_from, date_end]

        return intervals
