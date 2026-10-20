from odoo import fields, models


class PosPaymentTerminal(models.Model):
    _inherit = 'pos.payment.terminal'

    razorpay_tid = fields.Char(string='Razorpay Device Serial No', help='Device Serial No \n ex: 7000012300', copy=False)
    razorpay_username = fields.Char(string='Razorpay Username', help='Username(Device Login) \n ex: 1234500121')
