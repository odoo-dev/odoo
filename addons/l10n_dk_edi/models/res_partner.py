# Part of Odoo. See LICENSE file for full copyright and licensing details.

import requests
from lxml import etree
from hashlib import md5
from urllib import parse

from odoo import api, fields, models
from odoo.addons.account_peppol.tools.demo_utils import handle_demo

TIMEOUT = 10

class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_dk_edi_is_endpoint_valid = fields.Boolean(
        string="Nemhandel endpoint validity",
        help="The partner's identifier is valid",
        compute="_compute_l10n_dk_edi_is_endpoint_valid", store=True,
        copy=False,
    )
    l10n_dk_edi_validity_last_check = fields.Date(
        string="Checked on",
        help="Last Nemhandel endpoint verification",
        readonly=True,
        copy=False,
    )
    l10n_dk_edi_verification_label = fields.Selection(
        selection=[
            ('not_verified', 'Not verified yet'),
            ('not_valid', 'Not valid'),
            ('valid', 'Valid'),
        ],
        string='Nemhandel endpoint validity',
        compute='_compute_l10n_dk_edi_verification_label',
        copy=False,
    ) # field to compute the label to show for partner endpoint

    @api.depends('l10n_dk_edi_identifier_type', 'l10n_dk_edi_identifier_value')
    def _compute_l10n_dk_edi_is_endpoint_valid(self):
        # Every change in l10n_dk_edi_identifier_type or l10n_dk_edi_identifier_value should set the validity back to False
        self.l10n_dk_edi_is_endpoint_valid = False

    @api.depends('l10n_dk_edi_is_endpoint_valid', 'l10n_dk_edi_validity_last_check')
    def _compute_l10n_dk_edi_verification_label(self):
        for partner in self:
            if not partner.l10n_dk_edi_validity_last_check:
                partner.l10n_dk_edi_verification_label = 'not_verified'
            elif partner.l10n_dk_edi_is_endpoint_valid:
                partner.l10n_dk_edi_verification_label = 'valid'
            else:
                partner.l10n_dk_edi_verification_label = 'not_valid'

    @api.model
    def _check_peppol_participant_exists(self, edi_identification):
        hash_participant = md5(edi_identification.lower().encode()).hexdigest()
        endpoint_participant = parse.quote_plus(f"iso6523-actorid-upis::{edi_identification}")
        peppol_param = self.env['ir.config_parameter'].sudo().get_param('account_peppol.edi.mode', False)
        sml_zone = 'acc.edelivery' if peppol_param == 'test' else 'edelivery'
        smp_url = f"http://B-{hash_participant}.iso6523-actorid-upis.{sml_zone}.tech.ec.europa.eu/{endpoint_participant}"

        try:
            response = requests.get(smp_url, timeout=TIMEOUT)
        except requests.exceptions.ConnectionError:
            return False
        if response.status_code != 200:
            return False
        participant_info = etree.XML(response.content)
        participant_identifier = participant_info.findtext('{*}ParticipantIdentifier')
        service_metadata = participant_info.find('.//{*}ServiceMetadataReference')
        service_href = ''
        if service_metadata is not None:
            service_href = service_metadata.attrib.get('href', '')
        if edi_identification != participant_identifier or 'hermes-belgium' in service_href:
            # all Belgian companies are pre-registered on hermes-belgium, so they will
            # technically have an existing SMP url but they are not real Peppol participants
            return False
        return True

    @handle_demo
    def button_l10n_dk_edi_check_partner_endpoint(self):
        """ A basic check for whether a participant is reachable at the given
        Peppol participant ID - peppol_eas:peppol_endpoint (ex: '9999:test')
        The SML (Service Metadata Locator) assigns a DNS name to each peppol participant.
        This DNS name resolves into the SMP (Service Metadata Publisher) of the participant.
        The DNS address is of the following form:
        - "http://B-" + hexstring(md5(lowercase(ID-VALUE))) + "." + ID-SCHEME + "." + SML-ZONE-NAME + "/" + url_encoded(ID-SCHEME + "::" + ID-VALUE)
        (ref:https://peppol.helger.com/public/locale-en_US/menuitem-docs-doc-exchange)
        """
        self.ensure_one()

        if not self.peppol_eas and self.peppol_endpoint:
            self.l10n_dk_edi_is_endpoint_valid = False
        else:
            edi_identification = f'{self.l10n_dk_edi_identifier_type}:{self.l10n_dk_edi_identifier_value}'.lower()
            self.l10n_dk_edi_validity_last_check = fields.Date.context_today(self)
            self.l10n_dk_edi_is_endpoint_valid = self._check_l10n_dk_edi_participant_exists(edi_identification)
        return False
