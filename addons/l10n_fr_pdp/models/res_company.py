from urllib.parse import urljoin
import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.account.models.company import PEPPOL_LIST

PDP_identifier_re = re.compile(r'([0-9]{9})(_[0-9]{14})?(_.+)?$')


class ResCompany(models.Model):
    _inherit = 'res.company'

    pdp_contact_email = fields.Char(
        string='PDP Contact Email',
        compute='_compute_pdp_contact_email', store=True, readonly=False,
        help='Primary contact email for PDP connection related communications and notifications.\n'
             'In particular, this email is used by Odoo to reconnect your PDP account in case of database change.',
    )
    l10n_fr_pdp_proxy_state = fields.Selection(
        selection=[
            ('pending', 'Pending'),
            ('receiver', 'Sender & Receiver'),
            ('rejected', 'Rejected'),
        ],
        string='PDP Status',
        groups="base.group_user",
    )
    pdp_edi_user = fields.Many2one(
        comodel_name='account_edi_proxy_client.user',
        compute='_compute_pdp_edi_user',
    )
    pdp_identifier = fields.Char(related='partner_id.pdp_identifier', readonly=False)
    pdp_purchase_journal_id = fields.Many2one(
        comodel_name='account.journal',
        string='PDP Purchase Journal',
        domain=[('type', '=', 'purchase')],
        compute='_compute_pdp_purchase_journal_id', store=True, readonly=False,
        inverse='_inverse_pdp_purchase_journal_id',
    )

    @api.depends('email')
    def _compute_pdp_contact_email(self):
        for company in self:
            if not company.pdp_contact_email:
                company.pdp_contact_email = company.email

    @api.depends('account_edi_proxy_client_ids')
    def _compute_pdp_edi_user(self):
        for company in self:
            # by design, we can only have zero or one proxy user per company with type PDP
            company.pdp_edi_user = company.sudo().account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'pdp')

    @api.depends('l10n_fr_pdp_proxy_state')
    def _compute_pdp_purchase_journal_id(self):
        for company in self:
            if not company.pdp_purchase_journal_id and company.l10n_fr_pdp_proxy_state in ('pending', 'receiver'):
                company.pdp_purchase_journal_id = self.env['account.journal'].search([
                    *self.env['account.journal']._check_company_domain(company),
                    ('type', '=', 'purchase'),
                ], limit=1)
                company.pdp_purchase_journal_id.is_pdp_journal = True

    def _inverse_pdp_purchase_journal_id(self):
        for company in self:
            # This avoid having 2 or more journals from the same company with
            # `is_pdp_journal` set to True (which could occur after changes).
            journals_to_reset = self.env['account.journal'].search([
                ('company_id', '=', company.id),
                ('is_pdp_journal', '=', True),
            ])
            journals_to_reset.is_pdp_journal = False
            company.pdp_purchase_journal_id.is_pdp_journal = True

    @api.model
    def _check_pdp_identifier(self, pdp_identifier, warning=False):
        self.ensure_one()
        return pdp_identifier and PDP_identifier_re.match(pdp_identifier)

    def _get_pdp_edi_mode(self):
        self.ensure_one()
        config_param = self.env['ir.config_parameter'].sudo().get_param('l10n_fr_pdp.edi.mode')
        return self.pdp_edi_user.edi_mode or config_param or 'prod'

    def _get_pdp_webhook_endpoint(self):
        self.ensure_one()
        return urljoin(self.get_base_url(), '/pdp/webhook')

    def _pdp_supported_document_types(self):
        """Returns a flattened dictionary of all supported document types."""
        return {
            **self._peppol_supported_document_types(),
            'urn:un:unece:uncefact:data:standard:CrossDomainAcknowledgementAndResponse:100::CrossDomainAcknowledgementAndResponse##urn:peppol:france:billing:cdv:1.0::D22B': "French CDAR (Lifecycle Messages)",
            'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017::2.1': "UBL V2.1 Invoice",
            'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017::2.1': "UBL V2.1 CreditNote",
            'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100::CrossIndustryInvoice##urn:cen.eu:en16931:2017::D16B': "CII",
            'urn:peppol:doctype:pdf+xml##urn:cen.eu:en16931:2017#conformant#urn:peppol:france:billing:Factur-X:1.0::D22B': "French Factur-X",
            'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:peppol:france:billing:cius:1.0::2.1': "UBL EN16931 French CIUS Invoice",
            'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:peppol:france:billing:cius:1.0::2.1': "UBL EN16931 French CIUS CreditNote",
            'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#conformant#urn:peppol:france:billing:extended:1.0::2.1': "UBL EN16931 French CTC Extended Invoice",
            'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#conformant#urn:peppol:france:billing:extended:1.0::2.1': "UBL EN16931 French CTC Extended CreditNote",
            'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100::CrossIndustryInvoice##urn:cen.eu:en16931:2017#compliant#urn:peppol:france:billing:cius:1.0::D22B': "UN/CEFACT EN16931 French CIUS",
            'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100::CrossIndustryInvoice##urn:cen.eu:en16931:2017#conformant#urn:peppol:france:billing:extended:1.0::D22B': "UN/CEFACT EN16931 French CTC Extended",
        }
