from odoo import models, fields, api
from dateutil.relativedelta import relativedelta

from ..util import RRULE

recurring_fields = ['is_recurring', 'mo', 'tu', 'we', 'th', 'fr', 'sa', 'su', 'freq', 'until', 'count', 'interval',
                    'monthday', 'monthweekday_n', 'monthweekday_day']


class CalendarEventPrivate(models.Model):
    _name = "calendar.event_bis"
    _description = "Calendar Event Private"
    _order = "id desc"

    def _valid_field_parameter(self, field, name):  # USED FOR GENERATION OF THE PUBLIC FILE, REMOVE WHEN FINALIZED
        return name in ['public', 'public_default'] or super()._valid_field_parameter(field, name)

    timeslot_ids = fields.One2many('calendar.timeslot', 'event_id')

    is_public = fields.Boolean(default=False, public=True)
    partner_id = fields.Many2one('res.partner', string="Calendar", public=True, default=lambda self: self.env.user.partner_id.id)
    user_id = fields.Many2one('res.users', string="User", public=True, compute='_compute_user_id', store=True, precompute=True, default=lambda self: self.env.user.id)

    name = fields.Char(public_default="Busy")
    note = fields.Char()
    tag_ids = fields.Many2many('calendar.event_bis.tag', string="Tags")

    # Recurrence
    is_recurring = fields.Boolean(default=False, public=True)
    mo = fields.Boolean('Monday')
    tu = fields.Boolean('Tuesday')
    we = fields.Boolean('Wednesday')
    th = fields.Boolean('Thursday')
    fr = fields.Boolean('Friday')
    sa = fields.Boolean('Saturday')
    su = fields.Boolean('Sunday')
    freq = fields.Selection([('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('yearly', 'Yearly')],
        string='Frequency', default='weekly')
    until = fields.Datetime('End Date')
    count = fields.Integer('Count')
    interval = fields.Integer('Interval')
    monthday = fields.Integer('Nth of the month')               # 3rd of the month
    monthweekday_n = fields.Integer('Weekday of the month')     # 1st Monday of the month
    monthweekday_day = fields.Selection([
        ('mo', 'Monday'), ('tu', 'Tuesday'), ('we', 'Wednesday'),
        ('th', 'Thursday'), ('fr', 'Friday'), ('sa', 'Saturday'), ('su', 'Sunday')],
    )
    exdated = fields.Char('Excluded Dates', help="List of dates to exclude from the recurrence rule", default='')

    @property
    def rrule(self):
        self.ensure_one()
        if not self.is_recurring or not self.freq:
            return False
        return RRULE.RRULE({
            'mo': self.mo,
            'tu': self.tu,
            'we': self.we,
            'th': self.th,
            'fr': self.fr,
            'sa': self.sa,
            'su': self.su,
            'freq': self.freq,
            'until': self.until,
            'dtstart': min(self.timeslot_ids, key=lambda x: x.start).start,
            'interval': self.interval,
            'count': self.count,
            'monthday': self.monthday,
            'monthweekday_n': self.monthweekday_n,
            'monthweekday_day': self.monthweekday_day,
        }, self.exdated)

    @api.depends('partner_id')
    def _compute_user_id(self):
        for event in self:
            event.user_id = event.partner_id.user_id

    def unlink(self):
        self.timeslot_ids.unlink()
        super().unlink()

    def make_timeslots(self, current_ts=None):
        self.ensure_one()
        if not self.is_recurring or not self.freq:
            return
        current_ts = current_ts or self.timeslot_ids and self.timeslot_ids[0]
        if not current_ts:
            return
        start_ts = min(self.timeslot_ids, key=lambda x: x.start)
        copy_data = current_ts.copy_data({'event_id': False})[0]
        duration = relativedelta(hours=copy_data.get('duration', 1))
        values = [{**copy_data, 'start': x, 'stop': x + duration}
                  for x in RRULE.occurenceRRULE(self.rrule, start_ts.start - relativedelta(hours=1))]
        self.timeslot_ids = self.merge_timeslots(values, current_ts)

    def merge_timeslots(self, values, ts_to_keep=None):
        # Merge new timeslot values with existing ones on the current event instead of creating and unlinking everything
        # Timeslot are similar if they have the same start date
        self.ensure_one()
        # Values are by default sorted by start date
        currents_ts = iter((self.timeslot_ids or self.env['calendar.timeslot']).sorted('start'))
        values = iter(values)
        to_unlink, kept = self.env['calendar.timeslot'], self.env['calendar.timeslot']
        to_create = []
        value, ts = next(values, None), next(currents_ts, self.env['calendar.timeslot'])
        while ts and value:   # TODO SEE IF WE ALSO CHECK FOR STOP
            cmp = (ts.start - value['start']).total_seconds()
            if not cmp:     # Same start date
                value['attendee_ids'] = []
                ts.write(value)
                kept += ts
                value, ts = next(values, None), next(currents_ts, self.env['calendar.timeslot'])
            elif cmp > 0:   # Current is before values
                to_unlink += ts
                ts = next(currents_ts, self.env['calendar.timeslot'])
            else:           # Current is after values
                to_create.append(value)
                value = next(values, None)
        to_unlink = (to_unlink + to_unlink.browse([c.id for c in currents_ts]) + ts)
        if ts_to_keep in to_unlink:
            ts_to_keep.active = False   # We don't need it, but we keep it for user experience in form view
            to_unlink -= ts_to_keep
        to_unlink.unlink()
        new = kept.create(to_create + ([value] if value else []) + list(values))
        return new + kept + ts_to_keep


    def exdate(self, timeslot):
        self.ensure_one()
        self.exdated = self.exdated + ',' + str(timeslot.start.date()) if self.exdated else str(timeslot.start.date())
        timeslot.event_id = self.copy({'is_recurring': False})
        return timeslot.event_id

    def break_after(self, slot):
        self.ensure_one()
        post_break = self.timeslot_ids.filtered(lambda x: x.start >= slot.start)
        if self.count:
            post_break.event_id = self.copy({'count': len(post_break)})
            self.count -= len(post_break)
        else:
            post_break.event_id = self.copy()
            self.until = slot.start - relativedelta(days=1)
        return slot.event_id

    def write(self, values):
        res = super().write(values)
        for event in self:
            if event.is_recurring and set(values.keys()).intersection(recurring_fields):
                event.make_timeslots()
        return res
