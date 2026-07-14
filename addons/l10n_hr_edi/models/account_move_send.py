import base64
import datetime
import hashlib
import logging
import os
import tempfile
import uuid
import zoneinfo

from collections import defaultdict
from lxml import etree
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from odoo import api, fields, models
from odoo.tools.business_data import split_vat
from odoo.exceptions import UserError, ValidationError
from odoo.tools.xml_utils import cleanup_xml_node

from odoo.addons.l10n_hr_edi.tools.api import (
    MojEracunServiceError,
    _mer_api_send,
)

_logger = logging.getLogger(__name__)

NAMESPACES = {
    'tns': 'http://www.apis-it.hr/fin/2012/types/f73',
}


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    @api.model
    def _check_move_constraints(self, moves):
        # HR-BR-37: Invoice must contain HR-BT-4: Operator code in accordance with the Fiscalization Act.
        if any((move.country_code == 'HR' and not move.l10n_hr_operator_name) for move in moves):
            raise UserError(self.env._("Operator label is required for sending invoices in Croatia."))
        # HR-BR-9: Invoice must contain HR-BT-5: Operator OIB in accordance with the Fiscalization Act.
        if any((move.country_code == 'HR' and not move.l10n_hr_operator_oib) for move in moves):
            raise UserError(self.env._("Operator OIB is required for sending invoices in Croatia."))
        # HR-BR-25: ensure KPD is provided for every business line except for advance (P4)
        if any((move.country_code == 'HR' and move.l10n_hr_process_type != 'P4' and
                any(line.display_type == 'product' and not line.l10n_hr_kpd_category_id for line in move.line_ids)) for move in moves):
            raise UserError(self.env._('KPD categories must be defined on every invoice line for any Business Process Type other than P4.'))
        if any((move.country_code == 'HR' and move.l10n_hr_process_type == 'P99' and not move.l10n_hr_customer_defined_process_name) for move in moves):
            raise UserError(self.env._('Name of custom business process is required for Business Process Type P99.'))
        if any((move.country_code == 'HR' and
                len({line.tax_ids.tax_exigibility for line in move.line_ids if line.display_type == 'product'}) != 1) for move in moves):
            raise ValidationError(self.env._('For Croatia, all VAT taxes on an invoice should either be cash basis or not.'))
        if any(move.country_code == 'HR' and
            any(any((tax.tax_exigibility == 'on_payment' and not tax.invoice_legal_notes) for tax in line.tax_ids
             ) for line in move.line_ids if line.display_type == 'product') for move in moves):
            raise ValidationError(self.env._('For Croatia, Legal Notes should be provided for all cash basis taxes.'))
        super()._check_move_constraints(moves)

    # -------------------------------------------------------------------------
    # SENDING METHODS
    # -------------------------------------------------------------------------

    def _get_default_invoice_edi_format(self, move, **kwargs) -> str:
        # EXTENDS 'account'
        if 'mojeracun' in kwargs.get('sending_methods', []):
            return 'ubl_hr'
        return super()._get_default_invoice_edi_format(move, **kwargs)

    def _is_applicable_to_company(self, method, company):
        # EXTENDS 'account'
        if method == 'mojeracun':
            return company.l10n_hr_mer_connection_state == 'active' and company.country_code == 'HR'
        return super()._is_applicable_to_company(method, company)

    def _is_applicable_to_move(self, method, move, **move_data):
        # EXTENDS 'account'
        if method == 'mojeracun':
            partner = move.partner_id.commercial_partner_id.with_company(move.company_id)
            invoice_edi_format = move_data.get('invoice_edi_format') or 'ubl_hr'
            return all([
                self._is_applicable_to_company(method, move.company_id),
                partner.vat,    # Alternatively, partner GLN when proper support for that is added
                move._need_ubl_cii_xml(invoice_edi_format)
                or (move.ubl_cii_xml_id and move.l10n_hr_mer_document_status not in {'20', '30', '40'}),
            ])
        return super()._is_applicable_to_move(method, move, **move_data)

    def _hook_if_errors(self, moves_data, allow_raising=True):
        # EXTENDS 'account'
        moves_failed_file_generation = self.env['account.move']
        for move, move_data in moves_data.items():
            if 'mojeracun' in move_data['sending_methods'] and move_data.get('blocking_error'):
                moves_failed_file_generation |= move
        moves_failed_file_generation.l10n_hr_mer_document_status = '50'
        return super()._hook_if_errors(moves_data, allow_raising=allow_raising)

    @api.model
    def _generate_and_send_invoices(self, moves, from_cron=False, allow_raising=True, allow_fallback_pdf=False, **custom_settings):
        for move in moves:
            if move.country_code == 'HR' and move.is_sale_document():
                if not move.l10n_hr_edi_addendum_id:
                    move.l10n_hr_edi_addendum_id = self.env['l10n_hr_edi.addendum'].create({
                        'move_id': move.id,
                        'payment_method_type': move.l10n_hr_payment_method_type
                    })
                move.l10n_hr_edi_addendum_id.write({
                    'fiscalization_number': move._get_l10n_hr_fiscalization_number(move.name),
                    'invoice_sending_time': fields.Datetime.now(zoneinfo.ZoneInfo('Europe/Zagreb')),
                })
        return super()._generate_and_send_invoices(moves, from_cron=from_cron, allow_raising=allow_raising, allow_fallback_pdf=allow_fallback_pdf, **custom_settings)

    def _call_web_service_after_invoice_pdf_render(self, invoices_data):
        # EXTENDS 'account'
        super()._call_web_service_after_invoice_pdf_render(invoices_data)

        for invoice, invoice_data in invoices_data.items():
            # MojEracun determines the receiver endpoint entirely from the XML,
            # so there is no need to check for partner endpoint
            if 'mojeracun' not in invoice_data['sending_methods']:
                continue
            if not self._is_applicable_to_move('mojeracun', invoice, **invoice_data):
                raise UserError(self.env._("Failed to send invoice via MojEracun: check configuration."))

            if invoice_data.get('ubl_cii_xml_attachment_values'):
                xml_file = invoice_data['ubl_cii_xml_attachment_values']['raw']
            elif invoice.ubl_cii_xml_id and invoice.l10n_hr_mer_document_status not in {'20', '30', '40'}:
                xml_file = invoice.ubl_cii_xml_id.raw
            else:
                invoice.l10n_hr_edi_addendum_id.mer_document_status = '50'
                builder = invoice.partner_id.commercial_partner_id._get_edi_builder(invoice_data['invoice_edi_format'])
                invoice_data['error'] = self.env._(
                    "Errors occurred while creating the EDI document (format: %s):",
                    builder._description,
                )
                return
            addendum = invoice.l10n_hr_edi_addendum_id
            try:
                response = _mer_api_send(invoice.company_id, xml_file.decode())
            except MojEracunServiceError as e:
                addendum.mer_document_status = '50'
                invoice_data['error'] = e.message
            else:
                if not response.get('ElectronicId'):
                    addendum.mer_document_status = '50'
                    errors = []
                    for key in response:
                        errors.append(' '.join(response[key].get('Messages', [])))
                    invoice_data['error'] = {'error_title': "Error", 'errors': errors}
                else:
                    addendum.mer_document_eid = response['ElectronicId']
                    addendum.mer_document_status = '20'
                    log_message = self.env._('The document has been sent to MojEracun service provider for processing')
                    invoice._message_log(body=log_message)
            if self._can_commit():
                self.env.cr.commit()

    def _get_fiscalization_url(self):
        fisclization_mode = self.company_id.l10n_hr_fiscalization_mode
        urls = {
            'prod': "https://cis.porezna-uprava.hr:8449/FiskalizacijaService",
            'test': "https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest",
            'demo': "demo??",
        }
        return urls[fisclization_mode]

    @api.model
    def _is_fiscalization_applicable(self, move):
        """Determine if direct fiscalization (1.0) applies to this move.

        Direct fiscalization is applicable when:
        - Move is a customer invoice or refund
        - Company is in Croatia with fiscalization enabled
        - Invoice requires direct fiscalization (cash/card or B2C)
        """
        if not all([
            move.move_type in ('out_invoice', 'out_refund'),
            move.company_id.country_code == 'HR',
            move.company_id.l10n_hr_fiscalization_enabled,
        ]):
            return False

        # Check if this is a direct fiscalization case
        return move._l10n_hr_is_direct_fiscalization()

    def _get_all_extra_edis(self):
        res = super()._get_all_extra_edis()
        res.update({'fiscalization': {'label': self.env._("Fiscalization"), 'is_applicable': self._is_fiscalization_applicable}})
        return res

    def _l10n_hr_to_hr_local_dt(self, dt):
        """Convert given datetime to Europe/Zagreb tz-aware datetime.

        Accepts Odoo datetime field values or naive/aware Python datetimes.
        Returns tz-aware datetime in Europe/Zagreb.
        """
        dt_utc = fields.Datetime.to_datetime(dt) or fields.Datetime.now()
        dt_utc = (
            dt_utc.replace(tzinfo=datetime.UTC)
            if not dt_utc.tzinfo
            else dt_utc.astimezone(datetime.UTC)
        )
        return dt_utc.astimezone(zoneinfo.ZoneInfo('Europe/Zagreb'))

    def _l10n_hr_format_hr_datetime(self, dt):
        """Format a datetime as Croatian local time (Europe/Zagreb) in TA format.

        Input `dt` is expected to be an Odoo datetime field value or Python datetime
        (naive, UTC). Returns string in dd.MM.yyyyThh:mm:ss localized to Europe/Zagreb.
        """
        dt_local = self._l10n_hr_to_hr_local_dt(dt)
        return dt_local.strftime('%d.%m.%YT%H:%M:%S')

    def _l10n_hr_get_partner_oib(self, partner):
        """Extract and validate OIB from partner's vat field.

        Returns the 11-digit OIB string if valid, or False if not available/invalid.
        OIB (Osobni identifikacijski broj) must be exactly 11 numeric digits.
        """
        if not partner or not partner.vat:
            return False

        vat_prefix, oib = split_vat(partner.vat)
        if len(oib) == 11 and oib.isdigit():
            return oib
        return False

    def _l10n_hr_is_b2b_transaction(self, move):
        """Determine if the invoice is a B2B transaction.

        A transaction is B2B if:
        - The partner is a company (is_company=True)
        - The partner has a valid OIB in vat

        Note: Individuals also have OIB but those are not B2B transactions.
        """
        partner = move.partner_id.commercial_partner_id
        return partner.is_company and bool(self._l10n_hr_get_partner_oib(partner))

    def _call_web_service_before_invoice_pdf_render(self, invoices_data):
        super()._call_web_service_before_invoice_pdf_render(invoices_data)

        # Batch/cron runs (no checkbox field) fiscalize everything applicable;
        # the single-invoice wizard respects the user's checkbox instead.
        has_checkbox_field = 'extra_edi_checkboxes' in self._fields
        do_fiscalization = (
            bool(self.extra_edi_checkboxes and self.extra_edi_checkboxes.get('fiscalization', {}).get('checked'))
            if has_checkbox_field else True
        )
        if not do_fiscalization:
            return

        errors = []
        for invoice, invoice_data in invoices_data.items():
            if not self._is_fiscalization_applicable(invoice):
                continue
            try:
                self.l10n_hr_fiscalize_invoice(invoice)
            except UserError as e:
                invoice_data['error'] = str(e)
                errors.append(f"{invoice.name}: {e!s}")

        if has_checkbox_field and errors:
            raise UserError(self.env._("The following invoices had fiscalization errors:\n\n %s", errors))

    def _l10n_hr_generate_zki(self, move):
        """Generate ZKI (Zaštitni kod izdavatelja) per official spec.

        The payload is a concatenation of OIB, creation datetime, three-part
        invoice number, and total amount; signed with RSA-SHA256 then MD5-hashed.
        """
        _ = self.env._
        oib = self._l10n_hr_get_partner_oib(move.company_id)
        date_str = self._l10n_hr_format_hr_datetime(move.l10n_hr_invoice_sending_time)
        invoice_number = str(move.l10n_hr_fiscalization_number).split('/')

        if not oib:
            raise UserError(_("Customer's personal OIB is required for fiscalization"))

        if len(invoice_number) < 3:
            raise UserError(_("Invoice number format is not valid for fiscalization"))

        br_ozn_rac = invoice_number[0]
        ozn_pos_pr = invoice_number[1]
        ozn_nap_ur = invoice_number[2]
        concatenated_string = oib + date_str + br_ozn_rac + ozn_pos_pr + ozn_nap_ur + f"{move.amount_total:.2f}"

        certificate = move.company_id.l10n_hr_fiscalization_certificate

        if not certificate:
            raise UserError(_("Fiscalization certificate is missing"))

        certificate_record = certificate.sudo()
        private_key_data = bytes(certificate_record.with_context(bin_size=False).private_key_id.pem_key)

        password = None
        if b'ENCRYPTED' in private_key_data:
            if not certificate_record.pkcs12_password:
                raise UserError(_("Private key is encrypted but no password was provided"))
            password = certificate_record.pkcs12_password.encode()

        try:
            private_key = serialization.load_pem_private_key(private_key_data, password=password)
        except (TypeError, ValueError) as err:
            raise UserError(_("Error loading private key: %s", err))

        if not isinstance(private_key, rsa.RSAPrivateKey):
            raise UserError(_("The certificate's private key must be an RSA key for signing"))

        signature = private_key.sign(concatenated_string.encode(), padding.PKCS1v15(), hashes.SHA256())
        return hashlib.md5(signature).hexdigest()

    def _l10n_hr_prepare_fiscalization_request(self, move):
        """Prepare the dict consumed by QWeb to generate SOAP payloads."""

        oib = self._l10n_hr_get_partner_oib(move.company_id)
        date_str = self._l10n_hr_format_hr_datetime(move.l10n_hr_invoice_sending_time)
        invoice_number = str(move.l10n_hr_fiscalization_number).split('/')
        zki = move.l10n_hr_fiscalization_zki if not move.l10n_hr_fiscalization_zki else self._l10n_hr_generate_zki(move)
        sign = -1 if move.move_type == 'out_refund' else 1

        if len(invoice_number) < 3:
            raise UserError(self.env._("Invoice number format is not valid for fiscalization"))

        br_ozn_rac = invoice_number[0]
        ozn_pos_pr = invoice_number[1]
        ozn_nap_ur = invoice_number[2]

        u_sust_pdv = 'true' if move.company_id.l10n_hr_fiscalization_vat_liable else 'false'

        pdv_data = []
        pnp_data = []
        other_tax_data = []

        base_amounts_by_tax = defaultdict(float)
        for line in move.line_ids:
            for tax in line.tax_ids:
                base_amounts_by_tax[tax.id] += line.balance

        pdv_data, pnp_data, other_tax_data = [], [], []
        for tax_line in move.line_ids.filtered(lambda l: l.tax_line_id):
            tax = tax_line.tax_line_id
            base_amount = sign * abs(base_amounts_by_tax.get(tax.id, 0.0))
            tax_amount = sign * abs(tax_line.balance)
            entry = {
                'stopa': f'{tax.amount:.2f}',
                'osnovica': f'{base_amount:.2f}',
                'iznos': f'{tax_amount:.2f}',
            }
            tax_group = tax.tax_group_id.l10n_hr_fiscalization_tax_group_id
            if tax_group == 'pdv':
                pdv_data.append(entry)
            elif tax_group == 'pnp':
                pnp_data.append(entry)
            else:
                other_tax_data.append({**entry, 'naziv': tax.name})

        # Map Z (Ostalo from EDI) to O (Ostalo for direct fiscalization)
        payment_method = move.l10n_hr_payment_method_type
        if payment_method == 'Z':
            payment_method = 'O'

        if not move.l10n_hr_operator_oib:
            raise UserError(self.env._("Operator OIB is required. Please set the Fiscal User on the invoice."))

        # Recipient OIB for B2B cash/card transactions (spec v2.6)
        # Note: Since direct fiscalization (1.0) is only used for B2C (individuals),
        # this logic typically won't apply. B2B transactions use EDI (2.0) instead.
        recipient_oib = False
        if payment_method in ('G', 'K') and self._l10n_hr_is_b2b_transaction(move):
            partner = move.partner_id.commercial_partner_id
            recipient_oib = self._l10n_hr_get_partner_oib(partner)

        # Validation: OIB primatelja cannot be sent with payment method T (v181)
        if recipient_oib and payment_method == 'T':
            raise UserError(self.env._("Recipient OIB cannot be sent with payment method 'Transakcijski račun' (T)."))

        move.l10n_hr_fiscalization_old_recipient_oib = move.partner_id.commercial_partner_id.l10n_hr_personal_oib
        move.l10n_hr_old_payment_method_type = payment_method

        # Prepare XML request
        request_data = {
            'id_poruke': str(uuid.uuid4()),
            'datum_vrijeme': self._l10n_hr_format_hr_datetime(fields.Datetime.now()),
            'oib': oib,
            'u_sust_pdv': u_sust_pdv,
            'dat_vrijeme': date_str,
            'ozn_slijed': move.company_id.l10n_hr_fiscalization_sequence_identifier,
            'br_ozn_rac': br_ozn_rac,
            'ozn_pos_pr': ozn_pos_pr,
            'ozn_nap_ur': ozn_nap_ur,
            'pdv': pdv_data,
            'pnp': pnp_data,
            'ostali_por': other_tax_data,
            # Use explicit sign to ensure refunds (out_refund) are negative
            'iznos_ukupno': f'{sign * abs(move.amount_total):.2f}',
            'nacin_plac': payment_method,
            'oib_oper': move.l10n_hr_operator_oib,
            'zast_kod': zki,
            'nak_dost': 'false',
            'recipient_oib': recipient_oib,
        }

        return request_data

    def _l10n_hr_generate_xml_file(self, request_data, is_payment_change=False, check_status=False):
        """Render and sign the fiscalization SOAP envelope.

        Selects the appropriate QWeb template, injects an Id to the body node,
        and produces an enveloped XML-DSig signature.
        """
        if is_payment_change:
            template_name = 'l10n_hr_edi.template_invoice_payment_method_change_request'
        elif check_status:
            template_name = 'l10n_hr_edi.template_invoice_check_fisicalization_status'
        else:
            template_name = 'l10n_hr_edi.template_invoice_fisicalization'

        xml_str = self.env['ir.qweb']._render(template_name, request_data)
        xml_doc = cleanup_xml_node(xml_str)

        root = xml_doc if isinstance(xml_doc, etree._Element) else etree.fromstring(xml_doc)

        try:
            signed_xml = self._l10n_hr_sign_xml_file(root, is_payment_change, check_status)
            return etree.tostring(signed_xml, encoding='utf-8', xml_declaration=True)
        except Exception as e:  # noqa: BLE001
            raise UserError(self.env._("Error signing XML file: %s", e))

    def _l10n_hr_sign_xml_file(self, xml_doc, is_payment_change=False, check_status=False):
        """Sign a SOAP body element using the company's certificate.

        Enveloped XML-DSig with Exclusive C14N, RSA-SHA256 signature method,
        SHA1 digest, and X509 data attached to KeyInfo.
        """
        company = self._get_company_from_xml(xml_doc)
        certificate = company.l10n_hr_fiscalization_certificate

        if not certificate:
            raise UserError(self.env._("Fiscalization certificate is missing"))

        try:
            root = xml_doc if isinstance(xml_doc, etree._Element) else etree.fromstring(xml_doc)

            if is_payment_change:
                xpath = '//tns:PromijeniNacPlacZahtjev'
                element_id = 'PromijeniNacPlacZahtjev'
            elif check_status:
                xpath = '//tns:ProvjeraZahtjev'
                element_id = 'ProvjeraZahtjev'
            else:
                xpath = '//tns:RacunZahtjev'
                element_id = 'RacunZahtjev'

            racun_zahtjev = root.xpath(xpath, namespaces=NAMESPACES)[0]
            racun_zahtjev.set('Id', element_id)

            canonicalized_xml = etree.tostring(
                racun_zahtjev,
                method='c14n',
                exclusive=True,
                with_comments=False
            )

            digest = hashlib.sha256(canonicalized_xml).digest()
            digest_value = base64.b64encode(digest).decode('utf-8')
            # Render SignedInfo ONCE. This exact element - not a re-rendered copy -
            # is both what gets canonicalized+signed AND what gets shipped.
            signed_info_xml = self.env['ir.qweb']._render(
                'l10n_hr_edi.template_invoice_fiscalization_signed_info',
                {'element_id': element_id, 'digest_value': digest_value},
            )
            signed_info_el = etree.fromstring(signed_info_xml)

            signed_info_c14n = etree.tostring(
                signed_info_el,
                method='c14n',
                exclusive=True,
                with_comments=False,
            )

            certificate = certificate.sudo()
            signature_value = certificate._l10n_hr_sign_data(signed_info_c14n)
            cert_info = certificate._l10n_hr_get_certificate_info()

            signature_xml = self.env['ir.qweb']._render(
                'l10n_hr_edi.template_invoice_fiscalization_digital_signature',
                {
                    'element_id': element_id,
                    'digest_value': digest_value,
                    'signature_value': signature_value,
                    'certificate': cert_info['certificate'],
                    'issuer_name': cert_info['issuer_name'],
                    'serial_number': cert_info['serial_number'],
                }
            )
            signature_root = etree.fromstring(signature_xml)

            # Whatever SignedInfo template #2 produced, discard it and splice in the
            # exact element that was actually signed above - guarantees signed bytes
            # == shipped bytes regardless of any formatting drift between templates.
            rendered_signed_info = signature_root.find("{http://www.w3.org/2000/09/xmldsig#}SignedInfo")
            signature_root.replace(rendered_signed_info, signed_info_el)

            racun_zahtjev.append(signature_root)
            return root

        except Exception as e:  # noqa: BLE001
            raise UserError(self.env._("Error signing XML: %s", e))

    def _l10n_hr_send_xml_file(self, xml_doc, is_payment_change=False, check_status=False):
        """POST the signed XML to TA endpoints and normalize responses."""
        def _find_text(element, xpath):
            found = element.find(xpath, namespaces=NAMESPACES)
            return found.text if found is not None else None

        company = self._get_company_from_xml(xml_doc)
        fiscalization_mode = company.l10n_hr_fiscalization_mode
        url = self._get_fiscalization_url()

        headers = {
            'Content-Type': 'text/xml; charset=UTF-8',
            'SOAPAction': '',
        }

        tmp_bundle_path = None
        try:
            if isinstance(xml_doc, etree._Element):
                xml_doc = etree.tostring(xml_doc, encoding='UTF-8', xml_declaration=True)

            # Require FINA RDC CA PEMs for production so certificate verification
            # is never silently disabled.
            if fiscalization_mode == 'prod':
                interm_b64 = company.with_context(bin_size=False).l10n_hr_fiscalization_ca_intermediate_pem
                root_b64 = company.with_context(bin_size=False).l10n_hr_fiscalization_ca_root_pem
                if not interm_b64 or not root_b64:
                    raise UserError(self.env._(
                        "TA CA certificates are not configured. Upload both 'TA CA Intermediate (PEM)' "
                        "and 'TA CA Root (PEM)' on the company Fiscalization settings."
                    ))
                bundle_bytes = base64.b64decode(interm_b64)
                if not bundle_bytes.endswith(b"\n"):
                    bundle_bytes += b"\n"
                bundle_bytes += base64.b64decode(root_b64)
                if not bundle_bytes.endswith(b"\n"):
                    bundle_bytes += b"\n"
                with tempfile.NamedTemporaryFile(prefix="fina_ca_bundle_", suffix=".pem", delete=False) as f:
                    f.write(bundle_bytes)
                    f.flush()
                    tmp_bundle_path = f.name
                verify_param = tmp_bundle_path
            else:
                verify_param = False

            response = requests.post(url, data=xml_doc, headers=headers, timeout=30, verify=verify_param)

            if response.status_code != 200:
                response_xml = etree.fromstring(response.content)
                code = _find_text(response_xml, './/tns:SifraGreske')
                message = _find_text(response_xml, './/tns:PorukaGreske')
                detail = f"{code or ''} - {message or ''}" if code is not None or message is not None else None
                return {
                    'success': False,
                    'jir': None,
                    'datum_vrijeme': None,
                    'error': f"HTTP Error: {response.status_code} - {response.reason} - {detail}",
                }

            response_xml = etree.fromstring(response.content)

            if check_status:
                racun_element = _find_text(response_xml, './/tns:Racun')
                invoice_details = {}
                if racun_element is not None:
                    field_map = {
                        'OIB': './/tns:Oib',
                        'U sustavu PDV': './/tns:USustPdv',
                        'Datum i vrijeme': './/tns:DatVrijeme',
                        'Oznaka slijednosti': './/tns:OznSlijed',
                        'Iznos ukupno': './/tns:IznosUkupno',
                        'Način plaćanja': './/tns:NacinPlac',
                        'ZKI': './/tns:ZastKod',
                    }
                    for label, xpath in field_map.items():
                        value = _find_text(racun_element, xpath)
                        if value is not None:
                            invoice_details[label] = value

                    br_rac_element = _find_text(racun_element, './/tns:BrRac')
                    if br_rac_element is not None:
                        br_ozn_rac = _find_text(br_rac_element, './/tns:BrOznRac')
                        ozn_pos_pr = _find_text(br_rac_element, './/tns:OznPosPr')
                        ozn_nap_ur = _find_text(br_rac_element, './/tns:OznNapUr')
                        if br_ozn_rac is not None and ozn_pos_pr is not None and ozn_nap_ur is not None:
                            invoice_details['Broj računa'] = f"{br_ozn_rac}/{ozn_pos_pr}/{ozn_nap_ur}"

                timestamp = _find_text(response_xml, './/tns:DatumVrijeme')
                success_element = response_xml.find('.//tns:ProvjeraOdgovor', namespaces=NAMESPACES)

                errors = []
                for error_element in response_xml.findall('.//tns:Greska', namespaces=NAMESPACES):
                    error_code = _find_text(error_element, './/tns:SifraGreske')
                    error_message = _find_text(error_element, './/tns:PorukaGreske')
                    if error_code is not None and error_message is not None:
                        errors.append({'code': error_code, 'message': error_message})

                has_errors = any(error['code'] != 'v100' for error in errors)

                if success_element is not None and not has_errors:
                    return {
                        'success': True,
                        'datum_vrijeme': timestamp,
                        'errors': errors,
                        'invoice_details': invoice_details,
                        'error': None,
                    }
                error_message = "; ".join(f"{error['code']}: {error['message']}" for error in errors)
                return {
                    'success': False,
                    'datum_vrijeme': timestamp,
                    'errors': errors,
                    'invoice_details': invoice_details,
                    'error': error_message or "Unknown error",
                }

            elif is_payment_change:
                # The payment-change response confirms success/failure only - it
                # never contains a JIR.
                success_element = response_xml.find('.//tns:PromijeniNacPlacOdgovor', namespaces=NAMESPACES)
                timestamp = _find_text(response_xml, './/tns:DatumVrijeme')

                if success_element is not None:
                    return {
                        'success': True,
                        'datetime_of_payment_method_change': timestamp,
                        'error': None,
                    }
                code = _find_text(response_xml, './/tns:SifraGreske')
                message = _find_text(response_xml, './/tns:PorukaGreske')
                error_message = f"{message or ''} - {code or ''}" if code is not None or message is not None else "Unknown error"
                return {'success': False, 'error': error_message}
            else:
                return {
                    'success': True,
                    'jir': _find_text(response_xml, './/tns:Jir'),
                    'datum_vrijeme': _find_text(response_xml, './/tns:DatumVrijeme'),
                    'error': None,
                }
        except Exception as e:  # noqa: BLE001
            _logger.exception("Fiscalization web service call failed for company %s", company.display_name)
            return {'success': False, 'jir': None, 'datum_vrijeme': None, 'error': str(e)}
        finally:
            try:
                if tmp_bundle_path and os.path.exists(tmp_bundle_path):
                    os.unlink(tmp_bundle_path)
            except Exception:  # noqa: BLE001
                _logger.warning("Failed to remove temporary CA bundle file %s", tmp_bundle_path)

    def l10n_hr_fiscalize_invoice(self, invoice):
        """Fiscalize the invoice with Croatian Tax Authority"""
        if invoice.l10n_hr_fiscalization_status == '0' and invoice.l10n_hr_fiscalization_jir:
            current_oib = invoice.partner_id.commercial_partner_id.l10n_hr_personal_oib
            old_oib = invoice.l10n_hr_fiscalization_old_recipient_oib
            current_payment_method_type = invoice.l10n_hr_payment_method_type
            old_payment_method_type = invoice.l10n_hr_old_payment_method_type
            if current_oib != old_oib:
                invoice.l10n_hr_change_payment_method(current_payment_method_type, current_oib, True)
                return
            elif current_payment_method_type != old_payment_method_type:
                invoice.l10n_hr_change_payment_method(current_payment_method_type)
                return
            else:
                raise UserError(self.env._(
                    "Invoice %(invoice)s has already been fiscalized with JIR: %(jir)s",
                    invoice=invoice.name,
                    jir=invoice.l10n_hr_fiscalization_jir,
                ))

        if not invoice.l10n_hr_fiscalization_zki:
            invoice.l10n_hr_fiscalization_zki = self._l10n_hr_generate_zki(invoice)

        request_data = self._l10n_hr_prepare_fiscalization_request(invoice)

        try:
            xml_doc = self._l10n_hr_generate_xml_file(request_data)
            response = self._l10n_hr_send_xml_file(xml_doc)
            if response['success']:
                fiscalization_datetime = self._convert_hr_datetime_to_odoo(response['datum_vrijeme'])
                invoice.write({
                    'l10n_hr_fiscalization_status': '0',
                    'l10n_hr_fiscalization_jir': response['jir'],
                    'l10n_hr_invoice_sending_time': fiscalization_datetime,
                    'l10n_hr_fiscalization_error': False,
                })
                return True
            else:
                invoice.write({
                    'l10n_hr_fiscalization_status': '1',
                    'l10n_hr_fiscalization_error': response['error'],
                })
                raise UserError(self.env._("Fiscalization failed: %s", response['error']))
        except Exception as e:  # noqa: BLE001
            invoice.write({
                'l10n_hr_fiscalization_status': '1',
                'l10n_hr_fiscalization_error': str(e),
            })
            raise UserError(self.env._("Fiscalization failed: %s", e))

    def _convert_hr_datetime_to_odoo(self, hr_datetime_str):
        """Convert Croatian datetime string (dd.MM.yyyyThh:mm:ss) to Odoo datetime"""
        try:
            dt = datetime.datetime.strptime(
                hr_datetime_str or fields.Datetime.now().strftime('%d.%m.%YT%H:%M:%S'),
                '%d.%m.%YT%H:%M:%S',
            )
            dt = dt.replace(tzinfo=zoneinfo.ZoneInfo('Europe/Zagreb'))
            return dt.astimezone(datetime.UTC).replace(tzinfo=None)
        except Exception:  # noqa: BLE001
            return fields.Datetime.now()

    def _get_company_from_xml(self, xml_doc):
        ns = {
            'tns': 'http://www.apis-it.hr/fin/2012/types/f73',
            'soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
        }
        try:
            root = xml_doc if isinstance(xml_doc, etree._Element) else etree.fromstring(xml_doc)
            oib_element = root.xpath('//tns:Oib', namespaces=ns)
            if oib_element and len(oib_element) > 0:
                oib = oib_element[0].text
                oib = 'HR' + oib
                company = self.env['res.company'].search([('vat', '=', oib)], limit=1)
                if company:
                    return company
        except Exception as e:  # noqa: BLE001
            _logger.error(self.env._("Error extracting company from XML: %s", e))
        return self.env.company
