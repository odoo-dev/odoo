from odoo import _, models
from odoo.tools import html2plaintext
from odoo.tools.misc import formatLang


PAID_STATES = frozenset({'paid', 'in_payment', 'reversed'})

# [BR-FR-MAP-17/18/19] The French CIUS caps the length of some business terms.
L10N_FR_PDP_BUSINESS_TERM_MAX_LENGTHS = {
    'BT-22': 1024,  # Invoice note
    'BT-35': 255,  # Address line 1 (BT-35, BT-50, BT-75, ...)
    'BT-36': 255,  # Address line 2
    'BT-37': 255,  # City
    'BT-38': 10,  # Post code
    'BT-39': 255,  # Country subdivision
    'BT-153': 255,  # Item name
}


class AccountEdiCommon(models.AbstractModel):
    _inherit = "account.edi.common"

    def _get_default_notes(self, vals):
        invoice = vals['invoice']
        company = vals['company']
        # Mandatory / default notes for French e-invoicing [BR-FR-05]
        # Only add them when using PDP
        if not company._peppol_is_french_company():
            return {}
        payment_term = invoice.invoice_payment_term_id
        return {
            'PMT': self.env._
                ("In the event of late payment, a flat-rate fee of €40 for collection costs will be charged (Articles L.441-10 and D.441-5 of the Code de commerce)."),
            'PMD': self.env._
                ("Late payment penalties at an annual rate of 10% are applied if the payment is made after the due date."),
            'AAB': html2plaintext(payment_term.note) if payment_term.early_discount else self.env._
                ("No discount for early payment."),
        }

    def _l10n_fr_pdp_get_profile_id(self, vals):
        invoice = vals['invoice']
        # Les valeurs autorisées pour le Cadre (Mode de Facturation) sont:
        # B1 : Dépôt d'une facture de bien
        # S1 : Dépôt d'une facture de prestation de service
        # M1 : Dépôt d'une facture double (livraison de bien et services qui ne sont pas accessoires l'une de l'autre)
        # B2 : Dépôt d'une facture de bien déjà payée
        # S2 : Dépôt d'une facture de prestation de service déjà payée
        # M2 : Dépôt d'une facture double déjà payée
        # B4 : Dépôt d'une facture définitive (après acompte) de bien
        # S4 : Dépôt d'une facture définitive (après acompte) de service
        # M4 : Dépôt d'une facture définitive (après acompte) double
        # S5 : Dépôt par un sous-traitant d'une facture de prestation de service
        # S6 : Dépôt par un cotraitant d'une facture de prestation de service
        # B7 : Dépôt d'une facture de bien ayant fait l'objet d'un e-reporting (TVA déjà collectée)
        # S7 : Dépôt d'une facture de prestation de service ayant fait l'objet d'un e-reporting (TVA déjà collectée)

        tax_scopes = set(invoice.invoice_line_ids.tax_ids.mapped('tax_scope'))
        profile_scope = "B"
        if {'service', 'consu'}.issubset(tax_scopes):
            profile_scope = "M"
        elif 'service' in tax_scopes:
            profile_scope = "S"

        profile_number = "1"
        if vals['currency'].is_zero(invoice.amount_residual) and invoice.payment_state in PAID_STATES:
            # Already paid
            profile_number = "2"
        elif not invoice._is_downpayment() and invoice.invoice_line_ids._get_downpayment_lines():
            # After downpayment
            profile_number = "4"

        profile_id = f"{profile_scope}{profile_number}"
        return profile_id

    # -------------------------------------------------------------------------
    # IMPORT: DOWN PAYMENTS (shared by the UBL and CII syntaxes)
    # -------------------------------------------------------------------------

    def _l10n_fr_pdp_import_downpayments(self, collected_values, prepaid_amount, downpayment_name_nodes, downpayment_domain):
        """ The imported invoice is a final invoice following downpayments (profile B4/S4/M4): all the billing
        references are assumed to be references to the downpayments, whose lines are copied to be subtracted from the
        final invoice (see '_l10n_fr_pdp_import_add_downpayment_lines').

        :param collected_values:        The import values.
        :param prepaid_amount:          The paid amount (BT-113) of the document.
        :param downpayment_name_nodes:  The nodes holding the references of the downpayments.
        :param downpayment_domain:      An additional domain to search the downpayments.
        """
        invoice = collected_values['invoice']
        currency = collected_values['currency_values']['currency']
        collected_values['prepaid_amount'] = prepaid_amount
        if invoice.currency_id.is_zero(prepaid_amount):
            return

        # groups downpayments by ref to avoid a downpayment being duplicated in the db being substracted multiple times
        grouped_downpayments = self.env['account.move'].search([
            ('ref', 'in', [downpayment.text for downpayment in downpayment_name_nodes]),
            *downpayment_domain,
        ]).grouped('ref')
        downpayment_lines = self.env['account.move.line']
        for downpayments in grouped_downpayments.values():
            downpayment = downpayments[0]
            for line in downpayment.invoice_line_ids:
                downpayment_lines |= line.copy({'quantity': -line.quantity if downpayment.move_type == 'in_invoice' else line.quantity})
        collected_values['downpayment_lines'] = downpayment_lines

        # logging
        formatted_amount = formatLang(self.env, prepaid_amount, currency_obj=currency)
        collected_values['logs'].append(_("A downpayment of %s was detected.", formatted_amount))
        for downpayment_name in downpayment_name_nodes:
            if downpayment_name.text not in grouped_downpayments:
                collected_values['logs'].append(_("Downpayment %s not found. Imported amounts will probably be incorrect.", downpayment_name.text))

    def _l10n_fr_pdp_import_add_downpayment_lines(self, collected_values):
        """ Downpayments may be reported as a prepaid amount. In this case, the final invoice untaxed amount, tax amount
        and total amount correspond to the amounts without any downpayments made. We need to add the downpayment lines
        as negative lines in the final invoice because we already imported and accounted for the downpayments.
        """
        invoice = collected_values['invoice']
        if downpayment_lines := collected_values.get('downpayment_lines'):
            container = {'records': invoice}
            with (
                invoice._check_balanced(container),
                invoice._disable_discount_precision(),
                invoice._sync_dynamic_lines(container),
            ):
                downpayment_lines.move_id = invoice.id
