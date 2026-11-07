from odoo import models


class ResourceCalendar(models.Model):
    _inherit = 'resource.calendar'

    _mrp__mrp_workcenter_calendar = models.Ref('mrp.mrp_workcenter_calendar', required=False)
