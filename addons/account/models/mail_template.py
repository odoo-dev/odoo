from odoo import models
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)

_MASTER_TEMPLATE_MESSAGE = _lt("You cannot delete this mail template, it is used in the invoice sending flow.")


class MailTemplate(models.Model):
    _inherit = 'mail.template'

    _template_edi_invoice = models.Ref('account.email_template_edi_invoice', 'mail.template', message=_MASTER_TEMPLATE_MESSAGE)
    _template_edi_credit_note = models.Ref('account.email_template_edi_credit_note', 'mail.template', message=_MASTER_TEMPLATE_MESSAGE)
