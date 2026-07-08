import json

from odoo import api, models


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def is_eg_eta_edi_demo_applicable(self, move):
        return move._is_l10n_eg_edi_applicable(mode='demo')

    @api.model
    def is_eg_eta_edi_test_applicable(self, move):
        return move._is_l10n_eg_edi_applicable(mode='preproduction')

    @api.model
    def is_eg_eta_edi_applicable(self, move):
        return move._is_l10n_eg_edi_applicable(mode='production')

    def _get_all_extra_edis(self) -> dict:
        # EXTENDS 'account'
        res = super()._get_all_extra_edis()
        res.update({
            'eg_eta_edi_demo': {
                'label': self.env._("To ETA (Demo)"),
                'is_applicable': self.is_eg_eta_edi_demo_applicable,
                'help': self.env._("Simulate sending e-invoice to ETA."),
            },
            'eg_eta_edi_test': {
                'label': self.env._("To ETA (Pre-production)"),
                'is_applicable': self.is_eg_eta_edi_test_applicable,
                'help': self.env._("Send the e-invoice to Egyptian EDI (ETA) Pre-production environment"),
            },
            'eg_eta_edi': {
                'label': self.env._("To ETA"),
                'is_applicable': self.is_eg_eta_edi_applicable,
                'help': self.env._("Send the e-invoice to Egyptian EDI (ETA) Production environment"),
            },
        })
        return res

    def _prepare_l10n_eg_edi_error_message(self, error):
        return self.env._("Code: %(code)s, Message: %(message)s", code=error.get('code'), message=error.get('message'))

    @api.model
    def _get_alerts(self, moves, moves_data):
        # EXTENDS 'account'
        alerts = super()._get_alerts(moves, moves_data)
        eg_moves = moves.filtered(
            lambda m: 'eg_eta_edi' in moves_data[m]['extra_edis'] or 'eg_eta_edi_test' in moves_data[m]['extra_edis'] or 'eg_eta_edi_demo' in moves_data[m]['extra_edis']
        )
        if not eg_moves:
            return alerts

        if (companies := eg_moves.company_id) and len(companies) > 1:
            alerts.update({
                'eg_eta_edi_multiple_companiesbranch partner': {
                    'level': 'danger',
                    'message': self.env._(
                        """Only invoices from one company can be signed at a time.
                        Please select invoices from a single company to sign and send to ETA.""",
                    ),
                },
            })
        elif companies.l10n_eg_edi_api_mode != 'demo' and (not companies.l10n_eg_client_identifier or not companies.l10n_eg_client_secret):
            alerts.update({
                'eg_eta_edi_no_client_id_secret': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please configure Client ID and Secret Key for the company %s.",
                        companies[0].name,
                    ),
                },
            })

        if missing_branch_details := eg_moves.journal_id.l10n_eg_branch_id.filtered(lambda p: p._check_l10n_eg_missing_address_data()):
            alerts.update({
                'eg_eta_edi_missing_company_address': {
                    'level': 'danger',
                    'message': self.env._("Please fill in the address details for the following Journal Branches"),
                    'action_text': self.env._("view branches"),
                    'action': missing_branch_details._get_records_action(),
                },
            })

        if missing_partner_address := eg_moves.partner_id.filtered(lambda p: p._check_l10n_eg_missing_address_data()):
            alerts.update({
                'eg_eta_edi_missing_partner_address': {
                    'level': 'danger',
                    'message': self.env._("Please fill in the address details for the following partners."),
                    'action_text': self.env._("View Partners"),
                    'action': missing_partner_address._get_records_action(),
                },
            })

        if companies[0].l10n_eg_edi_api_mode == 'demo':
            alerts.update({
                'eg_eta_edi_demo_mode_warning': {
                    'level': 'warning',
                    'message': self.env._(
                        "The company %s is configured in Test Mode for ETA E-Invoicing. Invoices will not be sent to ETA.",
                        companies[0].name,
                    ),
                },
            })
        elif not (thumb_drive := self.env['l10n_eg_edi.thumb.drive'].search(
            [('user_id', '=', self.env.user.id), ('company_id', '=', companies[0].id)],
        )):
            alerts.update({
                'eg_eta_edi_no_thumb_drive': {
                    'level': 'danger',
                    'message': self.env._(
                        "You need to configure a thumb drive for the company %s in order to sign invoices.",
                        companies[0].name,
                    ),
                },
            })
        elif not thumb_drive.certificate:
            alerts.update({
                'eg_eta_edi_no_certificate': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please configure certificate for the thumb drive for company %s to sign invoices.",
                        companies[0].name,
                    ),
                },
            })
        elif unsigned_moves := eg_moves.filtered(
            lambda m: not m.l10n_eg_eta_json_doc_file or not json.loads(m.l10n_eg_eta_json_doc_file.content).get('request', {}).get('signatures')
        ):
            alerts.update({
                'eg_eta_edi_moves_not_signed': {
                    'level': 'danger',
                    'message': self.env._("The invoice(s) are not signed. Please click on sign to sign them before sending."),
                    'action_text': self.env._("Sign Invoices"),
                    'action_call': ('account.move', 'action_sign_invoices', unsigned_moves.ids),
                }
            })

        if moves_without_journal_config := eg_moves.filtered(
            lambda m: not (
                m.journal_id.l10n_eg_branch_id
                and m.journal_id.l10n_eg_activity_type_id
                and m.journal_id.l10n_eg_branch_identifier
            ),
        ):
            alerts.update({
                'eg_eta_edi_journal_not_configured': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please configure Egyptian ETA Settings on the Journal(s).",
                    ),
                    'action_text': self.env._("View Journals"),
                    'action': moves_without_journal_config.journal_id._get_records_action(),
                },
            })

        amls_to_check = eg_moves.invoice_line_ids.filtered(lambda l: l.display_type not in {'line_section', 'line_subsection', 'line_note'})

        if amls_without_tax := amls_to_check.filtered(lambda l: not l.tax_ids):
            alerts.update({
                'eg_eta_edi_no_tax_lines': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please make sure that there is tax in each invoice lines.",
                    ),
                    'action_text': self.env._("View Invoices"),
                    'action': amls_without_tax._get_records_action(),
                },
            })

        if lines_without_product := amls_to_check.filtered(lambda l: not l.product_id):
            alerts.update({
                'eg_eta_edi_lines_without_product': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please make sure that following invoice lines have a product in them.",
                    ),
                    'action_text': self.env._("View Invoices"),
                    'action': lines_without_product.move_id._get_records_action(),
                },
            })

        if invalid_line_names := amls_to_check.filtered(lambda l: len(l.name) > 500):
            alerts.update({
                'eg_eta_edi_lines_with_invalid_name': {
                    'level': 'danger',
                    'message': self.env._("""
                        The product description exceeds the ETA limit of 500 characters (including spaces) for some
                        invoice lines. Please shorten the description and try again.
                    """),
                    'action_text': self.env._("View Products"),
                    'action': invalid_line_names._get_records_action(),
                }
            })

        if products_without_code := amls_to_check.product_id.filtered(lambda p: not (p.l10n_eg_eta_code or p.barcode)):
            alerts.update({
                'eg_eta_edi_lines_without_product': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please make sure that following products have barcode or ETA Item code set on them.",
                    ),
                    'action_text': self.env._("View Products"),
                    'action': products_without_code._get_records_action(),
                },
            })

        return alerts

    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        super()._call_web_service_before_invoice_pdf_render(invoices_data)
        eg_moves = self.env['account.move']
        eg_demo_moves = self.env['account.move']
        for invoice, invoice_data in invoices_data.items():
            if 'eg_eta_edi_demo' in invoice_data['extra_edis']:
                eg_demo_moves |= invoice
            elif 'eg_eta_edi_test' in invoice_data['extra_edis'] or 'eg_eta_edi' in invoice_data['extra_edis']:
                eg_moves |= invoice
        if eg_moves:
            eg_moves._l10n_eg_edi_send_invoices_in_batch()
        if eg_demo_moves:
            eg_demo_moves._l10n_eg_edi_simulate_send_invoices()
