from odoo import models


class CrmTeam(models.Model):
    _inherit = 'crm.team'

    _pos_self_order_sale__pos_sales_team = models.Ref('pos_self_order_sale.pos_sales_team', required=False)
