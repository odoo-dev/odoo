from odoo import models


class AccountEdiUblPint(models.AbstractModel):
    _name = "account.edi.ubl_pint"
    _inherit = 'account.edi.ubl'
    _description = "UBL PINT"
