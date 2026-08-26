# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, models

# Spain places excluded from the VAT
# territory (TAI): Canary Islands, Ceuta and Melilla.
L10N_ES_NON_TAI_STATE_CODES = {'CE', 'GC', 'ME', 'TF'}

# Order mirrors the checkout dropdown: NIF-VAT, ID, Passport, Certificado de
# residencia, Otro documento probatorio.
L10N_ES_CHECKOUT_IDENTIFIER_FIELDS = [
    ('es_foreign_id', 'l10n_es_foreign_id'),
    ('es_passport', 'l10n_es_passport'),
    ('es_res_cert', 'l10n_es_res_cert'),
    ('es_other_id', 'l10n_es_other_id'),
]


class ResPartner(models.Model):
    _inherit = 'res.partner'

    @api.model
    def _l10n_es_requires_full_invoice_identification(self, country, state=False):
        """Extracomunitario rule: a buyer outside Spain's VAT territory (TAI) must be
        identified on the invoice (full invoice, not simplified). That's any non-EU
        country, plus the Canary Islands, Ceuta and Melilla, which belong to Spain but
        are excluded from the TAI.
        """
        if not country:
            return False

        eu_country_codes = self.env.ref('base.europe').country_ids.mapped('code')
        if country.code not in eu_country_codes:
            return True

        return country.code == 'ES' and bool(state) and state.code in L10N_ES_NON_TAI_STATE_CODES

    def _l10n_es_get_checkout_identifier(self):
        """The (type, value) pair to prefill the checkout ID-type dropdown with: whichever
        of NIF-VAT/ID/Passport/Certificado de residencia/Otro documento is already set on
        this partner, defaulting to NIF-VAT.
        """
        if not self:
            return 'vat', ''

        self.ensure_one()
        if self.vat:
            return 'vat', self.vat

        for key, field_name in L10N_ES_CHECKOUT_IDENTIFIER_FIELDS:
            if self[field_name]:
                return key, self[field_name]

        return 'vat', ''

    def _get_mandatory_billing_address_fields(self, country_sudo, **kwargs):
        """Make the VAT/NIF mandatory or optional on Spanish e-commerce orders
        based on the order amount, regardless of the customer's billing country.

        Orders whose total is at or below ``l10n_es_simplified_invoice_limit``
        (the company field already provided by l10n_es) may be invoiced with a
        simplified invoice, which does not require the customer's VAT. Above the
        limit -- or when the amount can't be determined -- VAT stays mandatory.
        """
        field_names = super()._get_mandatory_billing_address_fields(country_sudo, **kwargs)

        if self.env.company.country_code != 'ES':
            return field_names

        # The order is forwarded through the address-submit flow as a kwarg. The
        # dynamic "country changed" refresh route doesn't pass it, so fall back
        # to the current website cart.
        order_sudo = kwargs.get('order_sudo')
        if not order_sudo:
            # Can't determine the amount: keep VAT mandatory (safer default).
            field_names.add('vat')
            return field_names

        # Same threshold/comparison l10n_es uses to flag an invoice as
        # simplified (amount <= limit), so checkout and invoicing stay aligned.
        threshold_amount = self.env.company.l10n_es_simplified_invoice_limit
        eu_country_codes = self.env.ref('base.europe').country_ids.mapped('code')
        if order_sudo.amount_total <= threshold_amount or country_sudo.code not in eu_country_codes:
            field_names.discard('vat')
        else:
            field_names.add('vat')

        return field_names
