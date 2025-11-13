from odoo import _, api, fields, models


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def _get_alerts(self, moves, moves_data):
        res = super()._get_alerts(moves, moves_data)

        edi_moves = moves.filtered(lambda move: self._is_sa_edi_applicable(move))
        if invalid_moves := edi_moves.filtered(lambda move: move.commercial_partner_id == move.company_id.partner_id.commercial_partner_id):
            res['l10n_sa_edi_invalid_partner'] = {
                'message': _("Invoice cannot be posted as the Supplier and Buyer are the same."),
                'level': 'error',
                'action_text': _("View Invoices"),
                'action': invalid_moves._get_records_action(),
            }

        if invalid_moves := edi_moves.invoice_line_ids.filtered(lambda line: line.display_type == 'product' and line._check_edi_line_tax_required() and not line.tax_ids).move_id:
            res['l10n_sa_edi_no_tax_lines'] = {
                'message': _("Invoice lines need at least one tax. Please input it and try again."),
                'level': 'error',
                'action_text': _("View Invoices"),
                'action': invalid_moves._get_records_action(),
            }

        if invalid_journals := edi_moves.journal_id.filtered(lambda journal: not journal._l10n_sa_ready_to_submit_einvoices()):
            res['l10n_sa_edi_no_tax_lines'] = {
                'message': _("The Journals are not onboarded yet. Please onboard them and try again."),
                'level': 'error',
                'action_text': _("View Journals"),
                'action': invalid_journals._get_records_action(),
            }

        if invalid_companies := edi_moves.company_id.filtered(lambda company: not company._l10n_sa_check_organization_unit()):
            res['l10n_sa_edi_company_vat_invalid'] = {
                'message': _("The company VAT identification must contain 15 digits, with the first and last digits being '3' as per the BR-KSA-39 and BR-KSA-40 of ZATCA KSA business rule."),
                'level': 'error',
                'action_text': _("View Companies"),
                'action': invalid_companies._get_records_action(),
            }

        if invalid_companies := edi_moves.journal_id.company_id.sudo().filtered(lambda company: not company.l10n_sa_private_key_id):
            res['l10n_sa_edi_company_key_invalid'] = {
                'message': _("No Private Key was generated for these companies. A Private Key is mandatory in order to generate Certificate Signing Requests (CSR)."),
                'level': 'error',
                'action_text': _("View Companies"),
                'action': invalid_companies._get_records_action(),
            }

        if invalid_suppliers := edi_moves.company_id.partner_id.commercial_partner_id.filtered(lambda partner: not (partner.state_id and partner.city)):
            res['l10n_sa_edi_supplier_missing'] = {
                'message': _("Some address fields are missing from the company."),
                'level': 'error',
                'action_text': _("View Partners"),
                'action': invalid_suppliers._get_records_action(),
            }

        invalid_scheme_partners = self.env['res.partner']
        empty_vat_partners = self.env['res.partner']
        for move in edi_moves:
            if (
                any(
                    tax.l10n_sa_exemption_reason_code in ('VATEX-SA-HEA', 'VATEX-SA-EDU')
                    for tax in move.invoice_line_ids.filtered(
                        lambda line: line.display_type == 'product',
                    ).tax_ids
                )
                and (
                    move.commercial_partner_id.identification_scheme != 'NAT'
                    or not move.commercial_partner_id.l10n_sa_edi_additional_identification_number
                )
            ):
                invalid_scheme_partners |= move.commercial_partner_id

            if move.commercial_partner_id == 'TIN' and not move.commercial_partner_id.vat:
                empty_vat_partners |= move.commercial_partner_id

        if invalid_scheme_partners:
            res['l10n_sa_edi_invalid_scheme_customers'] = {
                'message': _("""
                    Please set the Identification Scheme as National ID and Identification Number as the respective
                    number on the Customer, as the Tax Exemption Reason is set either as VATEX-SA-HEA or VATEX-SA-EDU
                """),
                'level': 'error',
                'action_text': _("View Partners"),
                'action': invalid_scheme_partners._get_records_action(),
            }

        if empty_vat_partners:
            res['l10n_sa_edi_empty_vat_customers'] = {
                'message': _("Please set the VAT Number as the Identification Scheme is Tax Identification Number"),
                'level': 'error',
                'action_text': _("View Partners"),
                'action': empty_vat_partners._get_records_action(),
            }

        if invalid_moves := edi_moves.filtered(lambda move: move.invoice_date > fields.Date.context_today(self.with_context(tz='Asia/Riyadh'))):
            res['l10n_sa_edi_invalid_date_moves'] = {
                'message': _("Please set the Invoice Date to be either less than or equal to today."),
                'level': 'error',
                'action_text': _("View Invoices"),
                'action': invalid_moves._get_records_action(),
            }

        if invalid_moves := edi_moves.filtered(lambda move: move.l10n_sa_show_reason and not move.l10n_sa_reason):
            res['l10n_sa_edi_empty_reason_moves'] = {
                'message': _("Please make sure the 'ZATCA Reason' for the issuance of the Credit/Debit Note is specified."),
                'level': 'error',
                'action_text': _("View Invoices"),
                'action': invalid_moves._get_records_action(),
            }

        if invalid_moves := edi_moves.filtered(lambda move: move.l10n_sa_show_reason and not move._l10n_sa_check_billing_reference()):
            res['l10n_sa_edi_invalid_ref_moves'] = {
                'message': _("Please make sure the 'Customer Reference' contains the sequential number of the original invoice(s) that the Credit/Debit Note is related to."),
                'level': 'error',
                'action_text': _("View Invoices"),
                'action': invalid_moves._get_records_action(),
            }

        return res

    @api.model
    def _is_sa_edi_applicable(self, move):
        # zatca_document = move.l10n_sa_edi_document_id.filtered(lambda d: d.state == 'to_send')
        # return move.country_code == 'SA' and move.move_type in ('out_invoice', 'out_refund') and zatca_document and move.state != 'draft'
        return move.country_code == 'SA' and move.move_type in ('out_invoice', 'out_refund') and move.state != 'draft'

    @api.model
    def _is_sa_edi_testing_applicable(self, move):
        return self._is_sa_edi_applicable(move) and move.company_id.l10n_sa_api_mode != 'production'

    @api.model
    def _is_sa_edi_production_applicable(self, move):
        return self._is_sa_edi_applicable(move) and move.company_id.l10n_sa_api_mode == 'production'

    def _get_all_extra_edis(self) -> dict:
        # EXTENDS 'account'
        res = super()._get_all_extra_edis()
        res.update({'sa_edi': {'label': _("To ZATCA"), 'is_applicable': self._is_sa_edi_production_applicable}})
        res.update({'sa_edi': {'label': _("To ZATCA (Testing)"), 'is_applicable': self._is_sa_edi_testing_applicable}})
        return res

    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_before_invoice_pdf_render(invoices_data)

        for invoice, invoice_data in invoices_data.items():
            if 'sa_edi' in invoice_data['extra_edis']:
                edi_document = invoice._l10n_sa_edi_create_document()
                edi_document._l10n_sa_post_zatca_edi()
