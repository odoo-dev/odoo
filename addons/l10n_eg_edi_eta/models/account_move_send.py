from odoo import api, models


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def is_eg_eta_edi_test_applicable(self, move):
        return (
            move.company_id.l10n_eg_edi_demo_mode
            and move.country_code == 'EG'
            and move.state == 'posted'
        )

    @api.model
    def is_eg_eta_edi_applicable(self, move):
        return (
            not move.company_id.l10n_eg_edi_demo_mode
            and move.country_code == 'EG'
            and move.state == 'posted'
        )

    def _get_all_extra_edis(self) -> dict:
        # EXTENDS 'account'
        res = super()._get_all_extra_edis()
        res.update({
            'eg_eta_edi_test': {
                'label': self.env._("To ETA (Testing)"),
                'is_applicable': self.is_eg_eta_edi_test_applicable,
                'help': self.env._("Send the e-invoice to Egyptian EDI (ETA) (Testing Mode)."),
            },
            'eg_eta_edi': {
                'label': self.env._("To ETA"),
                'is_applicable': self.is_eg_eta_edi_applicable,
                'help': self.env._("Send the e-invoice to Egyptian EDI (ETA)."),
            },
        })
        return res

    def _prepare_l10n_eg_edi_error_message(self, error):
        return self.env._("Code: %s, Message: %s", error.get('code'), error.get('message'))

    @api.model
    def _get_alerts(self, moves, moves_data):
        # EXTENDS 'account'
        alerts = super()._get_alerts(moves, moves_data)
        eg_moves = moves.filtered(lambda m: 'eg_eta_edi' in moves_data[m]['extra_edis'] or 'eg_eta_edi_test' in moves_data[m]['extra_edis'])
        if not eg_moves:
            return alerts

        if (companies := eg_moves.company_id) and len(companies) > 1:
            alerts.update({
                'eg_eta_edi_multiple_companies': {
                    'level': 'danger',
                    'message': self.env._(
                        """Only invoices from one company can be signed at a time.
                        Please select invoices from a single company to sign and send to ETA.""",
                    ),
                },
            })
        elif not companies.l10n_eg_client_identifier or not companies.l10n_eg_client_secret:
            alerts.update({
                'eg_eta_edi_no_client_id_secret': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please configure Client ID and Secret Key for the company %s.",
                        companies[0].name,
                    ),
                },
            })

        if companies[0].partner_id._check_l10n_eg_missing_address_data():
            alerts.update({
                'eg_eta_edi_missing_company_address': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please fill in the address details for the company %s.",
                        companies[0].name,
                    ),
                    'action_text': self.env._("Go to Company"),
                    'action': companies[0]._get_records_action(),
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

        if not (thumb_drive := self.env['l10n_eg_edi.thumb.drive'].search(
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

        if moves_without_tax := eg_moves.filtered(lambda m: m.invoice_line_ids.filtered(lambda line: not line.tax_ids)):
            alerts.update({
                'eg_eta_edi_no_tax_lines': {
                    'level': 'danger',
                    'message': self.env._(
                        "Please make sure that there is tax in each invoice lines.",
                    ),
                    'action_text': self.env._("View Invoices"),
                    'action': moves_without_tax._get_records_action(),
                },
            })

        if lines_without_product := eg_moves.invoice_line_ids.filtered(lambda l: not l.product_id):
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

        if products_without_code := eg_moves.invoice_line_ids.product_id.filtered(lambda p: not (p.l10n_eg_eta_code or p.barcode)):
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
