from odoo import models


class FleetServiceType(models.Model):
    _inherit = 'fleet.service.type'

    _account_fleet__data_fleet_service_type_vendor_bill = models.Ref('account_fleet.data_fleet_service_type_vendor_bill', required=False)
