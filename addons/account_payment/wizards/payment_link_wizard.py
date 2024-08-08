# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.tools import formatLang

from odoo.addons.payment import utils as payment_utils


class PaymentLinkWizard(models.TransientModel):
    _inherit = 'payment.link.wizard'

    invoice_amount_due = fields.Monetary(
        string="Amount Due",
        compute='_compute_invoice_amount_due',
        currency_field='currency_id'
    )
    open_installments = fields.Json(export_string_translation=False)
    open_installments_preview = fields.Html(
        export_string_translation=False, compute='_compute_open_installments_preview'
    )

    @api.depends('amount_max')
    def _compute_invoice_amount_due(self):
        for wizard in self:
            wizard.invoice_amount_due = wizard.amount_max

    @api.depends('open_installments')
    def _compute_open_installments_preview(self):
        for wizard in self:
            preview = ""
            for installment in wizard.open_installments or []:
                preview += "<div>"
                preview += _(
                    '#%(number)s - Installment of <strong>%(amount)s</strong> due on <strong class="text-primary">%(date)s</strong>',
                    number=installment['number'],
                    amount=formatLang(
                        self.env,
                        installment['amount'],
                        monetary=True,
                        currency_obj=wizard.currency_id,
                    ),
                    date=installment['date_maturity'],
                )
                preview += "</div>"
            wizard.open_installments_preview = preview

    def _prepare_url(self, base_url, related_document):
        """ Override of `payment` to use the portal page URL. """
        res = super()._prepare_url(base_url, related_document)
        if self.res_model != 'account.move':
            return res

        return f'{base_url}/{related_document.get_portal_url()}'

    def _prepare_query_params(self, related_document):
        """ Override of `payment` to define custom query params for invoice payment. """
        res = super()._prepare_query_params(related_document)
        if self.res_model != 'account.move':
            return res

        return {
            'move_id': related_document.id,
            'amount': self.amount,
            'payment_token': self._prepare_access_token(),
            'payment': True,
        }

    def _prepare_access_token(self):
        """ Override of `payment` to generate the access token only based on the amount. """
        res = super()._prepare_access_token()
        if self.res_model != 'account.move':
            return res

        return payment_utils.generate_access_token(self.res_id, self.amount)

    def _prepare_anchor(self):
        """ Override of `payment` to set the 'portal_pay' anchor. """
        res = super()._prepare_anchor()
        if self.res_model != 'account.move':
            return res

        return '#portal_pay'
