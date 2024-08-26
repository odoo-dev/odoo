import requests

from odoo import api, fields, models, _

from odoo.addons.account_edi_proxy_client.models.account_edi_proxy_user import AccountEdiProxyError
from odoo.addons.l10n_dk_nemhandel.tools.demo_utils import handle_demo
from odoo.exceptions import UserError


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_dk_nemhandel_is_endpoint_valid = fields.Boolean(
        string="Nemhandel endpoint validity",
        help="The partner's identifier is valid",
        compute="_compute_l10n_dk_nemhandel_is_endpoint_valid", store=True,
        copy=False,
    )
    l10n_dk_nemhandel_validity_last_check = fields.Date(
        string="Checked on",
        help="Last Nemhandel endpoint verification",
        readonly=True,
        copy=False,
    )
    l10n_dk_nemhandel_verification_label = fields.Selection(
        selection=[
            ('not_verified', 'Not verified yet'),
            ('not_valid', 'Not valid'),  # does not exist on Peppol at all
            ('not_valid_format', 'Cannot receive this format'),  # registered on Peppol but cannot receive the selected document type
            ('valid', 'Valid'),
        ],
        string='Nemhandel endpoint validity label TODO',
        compute='_compute_l10n_dk_nemhandel_verification_label',
        copy=False,
    ) # field to compute the label to show for partner endpoint

    l10n_dk_nemhandel_identifier_type = fields.Selection(
        string="Identifier type",
        help="TODO",
        tracking=True,
        selection=[
            ('GLN', "EAN/GLN"),
            ('DK:CVR', "CVR"),
            ('IBAN', "IBAN"),
            ('DK:SE', "SE"),
        ],
    )
    l10n_dk_nemhandel_identifier_value = fields.Char(
        string="RecipientID",
        help="TODO 'Recipient ID'.",
        tracking=True,
    )

    @api.depends('l10n_dk_nemhandel_identifier_type', 'l10n_dk_nemhandel_identifier_value')
    def _compute_l10n_dk_nemhandel_is_endpoint_valid(self):
        # Every change in l10n_dk_nemhandel_identifier_type or l10n_dk_nemhandel_identifier_value should set the validity back to False
        self.l10n_dk_nemhandel_is_endpoint_valid = False

    @api.depends('l10n_dk_nemhandel_is_endpoint_valid', 'l10n_dk_nemhandel_validity_last_check')
    def _compute_l10n_dk_nemhandel_verification_label(self):
        for partner in self:
            if not partner.l10n_dk_nemhandel_validity_last_check:
                partner.l10n_dk_nemhandel_verification_label = 'not_verified'
            elif partner.l10n_dk_nemhandel_is_endpoint_valid:
                partner.l10n_dk_nemhandel_verification_label = 'valid'
            else:
                partner.l10n_dk_nemhandel_verification_label = 'not_valid'

    @api.model
    def _check_l10n_dk_nemhandel_participant_exists(self, edi_identification):
        edi_user = self.env.company.account_edi_proxy_client_ids.filtered(lambda user: user.proxy_type == 'nemhandel')
        try:
            response = edi_user._make_request(
                url=f"{edi_user._get_server_url()}/api/nemhandel/1/check_user_exists",
                params={'edi_identification': edi_identification},
            )
        except requests.exceptions.ConnectionError:
            return False
        except AccountEdiProxyError:
            raise UserError(_('An error occurred while connecting to the IAP server. Please retry later or contact Odoo support.'))
        if response.get('code') == 203:
            return False
        return True

    @handle_demo
    def button_l10n_dk_nemhandel_check_partner_endpoint(self):
        """ A basic check for whether a participant is reachable at the given
        Peppol participant ID - peppol_eas:peppol_endpoint (ex: '9999:test')
        The SML (Service Metadata Locator) assigns a DNS name to each peppol participant.
        This DNS name resolves into the SMP (Service Metadata Publisher) of the participant.
        The DNS address is of the following form:
        - "http://B-" + hexstring(md5(lowercase(ID-VALUE))) + "." + ID-SCHEME + "." + SML-ZONE-NAME + "/" + url_encoded(ID-SCHEME + "::" + ID-VALUE)
        (ref:https://peppol.helger.com/public/locale-en_US/menuitem-docs-doc-exchange)
        """
        self.ensure_one()

        if not self.l10n_dk_nemhandel_identifier_type and self.l10n_dk_nemhandel_identifier_value:
            self.l10n_dk_nemhandel_is_endpoint_valid = False
        else:
            edi_identification = f'{self.l10n_dk_nemhandel_identifier_type}/{self.l10n_dk_nemhandel_identifier_value}'
            self.l10n_dk_nemhandel_validity_last_check = fields.Date.context_today(self)
            self.l10n_dk_nemhandel_is_endpoint_valid = self._check_l10n_dk_nemhandel_participant_exists(edi_identification)
        return False
