from base64 import b64decode, b64encode
from datetime import datetime
from hashlib import sha256

from lxml import etree
from markupsafe import Markup

from odoo import _, api, fields, models
from odoo.exceptions import UserError

L10N_SA_DOCUMENT_STATES = [
    ('to_send', 'To Send'),
    ('accepted', 'Accepted'),
    ('warning', 'Accepted (Warnings)'),
    ('rejected', 'Rejected'),
    ('error', 'Error'),
    ('unknown', 'Unknown'),
]

class L10nSaEdiDocument(models.Model):
    _name = 'l10n_sa_edi.document'
    _description = 'ZATCA Document'

    name = fields.Char(related='attachment_id.name')
    res_model = fields.Selection([
        ('account.move', "Standard"),
        ('pos.order', "Simplified"),
    ], string="Invoice Type", readonly=True, required=True)
    res_id = fields.Many2oneReference("Invoice", model_field="res_model", readonly=True, required=True)
    attachment_id = fields.Many2one(comodel_name='ir.attachment', readonly=True)
    state = fields.Selection(string="ZATCA State", selection=L10N_SA_DOCUMENT_STATES)
    message = fields.Text("ZATCA Errors/Warnings", translate=True)
    error_message = fields.Char("ZATCA Error Message")
    content = fields.Binary()
    journal_id = fields.Many2one(comodel_name="account.journal" ,compute="_compute_journal_id", store=True)
    l10n_sa_edi_chain_head_id = fields.Many2one(
      'l10n_sa_edi.document',
      string="ZATCA chain stopping document",
      copy=False,
      readonly=True,
      help="Technical field to know if the chain has been stopped by a previous invoice",
    )
    l10n_sa_chain_index = fields.Integer(
        string="ZATCA chain index", copy=False, readonly=True,
        help="Invoice index in chain, set if and only if an in-chain XML was submitted and did not error",
    )

    _unique_record = models.Constraint(
        'unique(res_model, res_id)',
        "Only one ZATCA document can be linked to a record!",
    )

    """
        Once the journal has been successfully onboarded, we can clear/report invoices through the ZATCA API:
            A) STANDARD Invoice:
                Make a call to the Clearance API '/invoices/clearance/single'.
                This will validate the invoice, sign it and apply a QR code then return the result.
            B) SIMPLIFIED Invoice:
                Make a call to the Reporting API '/invoices/reporting/single'.
                This will validate the invoice then return the result.
        The X509 Certificate and password from the PCSID API need to be provided in the request headers.
    """

    @api.depends('res_model', 'res_id')
    def _compute_journal_id(self):
        for doc in self:
            record = self.env[doc.res_model].browse(doc.res_id)
            if doc.res_model == 'account.move':
                doc.journal_id = record.journal_id
            elif doc.res_model == 'pos.order':
                doc.journal_id = record.session_id.config_id.journal_id
            else:
                doc.journal_id = False

    # ====== Helper Functions =======

    @api.model
    def _l10n_sa_get_zatca_datetime(self, timestamp):
        return fields.Datetime.context_timestamp(self.with_context(tz='Asia/Riyadh'), timestamp)

    @api.model
    def _l10n_sa_xml_node_content(self, root, xpath, namespaces=None):
        namespaces = namespaces or self.env['account.edi.xml.ubl_21.zatca']._l10n_sa_get_namespaces()
        return etree.tostring(root.xpath(xpath, namespaces=namespaces)[0], with_tail=False,
                              encoding='utf-8', method='xml')

    # ====== Xades Signing =======

    @api.model
    def _l10n_sa_get_digital_signature(self, company_id, invoice_hash):
        """Generate an ECDSA SHA256 digital signature for the XML eInvoice"""
        decoded_hash = b64decode(invoice_hash).decode()
        return company_id.sudo().l10n_sa_private_key_id._sign(decoded_hash, formatting='base64')

    @api.model
    def _l10n_sa_calculate_signed_properties_hash(self, issuer_name, serial_number, signing_time, public_key):
        """
        Calculate the SHA256 value of the SignedProperties XML node. The algorithm used by ZATCA expects the indentation
        of the nodes to start with 40 spaces, except for the root SignedProperties node.
        """
        signed_properties = etree.fromstring(self.env['ir.qweb']._render('l10n_sa_edi.export_sa_zatca_ubl_signed_properties', {
            'issuer_name': issuer_name,
            'serial_number': serial_number,
            'signing_time': signing_time,
            'public_key_hashing': public_key,
        }))
        etree.indent(signed_properties, space='    ')
        signed_properties_split = etree.tostring(signed_properties).decode().split('\n')
        signed_properties_final = ""
        for index, line in enumerate(signed_properties_split):
            if index == 0:
                signed_properties_final += line
            else:
                signed_properties_final += (' ' * 36) + line
            if index != len(signed_properties_final) - 1:
                signed_properties_final += '\n'
        signed_properties_final = etree.tostring(etree.fromstring(signed_properties_final))
        return b64encode(sha256(signed_properties_final).hexdigest().encode()).decode()

    @api.model
    def _l10n_sa_sign_xml(self, xml_content, certificate, signature):
        """Function that signs XML content of a UBL document with a provided B64 encoded X509 certificate"""
        root = etree.fromstring(xml_content)
        etree.indent(root, space='    ')

        def _set_content(xpath, content):
            node = root.xpath(xpath)[0]
            node.text = content

        der_cert = certificate._get_der_certificate_bytes(formatting='base64')

        issuer_name = certificate._l10n_sa_get_issuer_name()
        serial_number = certificate.serial_number
        signing_time = self._l10n_sa_get_zatca_datetime(datetime.now()).strftime('%Y-%m-%dT%H:%M:%SZ')
        public_key_hashing = b64encode(sha256(der_cert).hexdigest().encode()).decode()

        signed_properties_hash = self._l10n_sa_calculate_signed_properties_hash(issuer_name, serial_number,
                                                                                signing_time, public_key_hashing)

        _set_content("//*[local-name()='X509IssuerName']", issuer_name)
        _set_content("//*[local-name()='X509SerialNumber']", serial_number)
        _set_content("//*[local-name()='SignedSignatureProperties']/*[local-name()='SigningTime']", signing_time)
        _set_content("//*[local-name()='SignedSignatureProperties']//*[local-name()='DigestValue']", public_key_hashing)

        prehash_content = etree.tostring(root)
        invoice_hash = self.env['account.edi.xml.ubl_21.zatca']._l10n_sa_generate_invoice_xml_hash(prehash_content,
                                                                                                   'digest')

        _set_content("//*[local-name()='SignatureValue']", signature)
        _set_content("//*[local-name()='X509Certificate']", der_cert.decode())
        _set_content("//*[local-name()='SignatureInformation']//*[local-name()='DigestValue']", invoice_hash)
        _set_content("//*[@URI='#xadesSignedProperties']/*[local-name()='DigestValue']", signed_properties_hash)

        return etree.tostring(root, with_tail=False)

    @api.model
    def _l10n_sa_assert_clearance_status(self, clearance_data):
        """Assert Clearance status. To be overridden in case there are any other cases to be accounted for"""
        self.ensure_one()
        record = self.env[self.res_model].browse(self.res_id)
        mode = 'reporting' if record._l10n_sa_is_simplified() else 'clearance'
        if mode == 'clearance' and clearance_data.get('clearanceStatus', '') != 'CLEARED':
            return {'error': _("Invoice could not be cleared:\n%s", clearance_data), 'blocking_level': 'error'}
        elif mode == 'reporting' and clearance_data.get('reportingStatus', '') != 'REPORTED':
            return {'error': _("Invoice could not be reported:\n%s", clearance_data), 'blocking_level': 'error'}
        return clearance_data

    # ====== UBL Document Rendering & Submission =======

    def _l10n_sa_create_log(self, notify, attachment=False):
        self.ensure_one()
        attachment = attachment or self.attachment_id
        record = self.env[self.res_model].browse(self.res_id)
        vals_list = [{
            'l10n_sa_edi_document_id': self.id,
            'state': self.state,
            'res_model': self.res_model,
            'res_id': self.res_id,
            'attachment_name': attachment.name,
            'is_test': record.company_id.l10n_sa_api_mode != 'production',
            'message': self.message,
            }]

        if notify:
            notif_type = 'success'
            msg = self.env._('Document successfully accepted!')
            if self.state == 'error':
                notif_type = 'danger'
                msg = self.env._('Document is blocked. Please check it and try again')

            elif self.state == 'warning':
                notif_type = 'warning'
                msg = self.env._('Document accepted with warning(s). Please check it')

            self.env.user._bus_send('simple_notification', {
                'type': notif_type,
                'message': msg,
            })

        return self.env['l10n_sa_edi.log'].create(vals_list)

    @api.model
    def _l10n_sa_log_results(self, xml_content, notify, response_data=None, error=False):
        """
        Save submitted invoice XML hash in case of either Rejection or Acceptance.
        """
        self.ensure_one()
        bootstrap_cls, title, subtitle, content = ("success", _("Success: Invoice accepted by ZATCA"), "", "" if (not error or not response_data) else response_data)
        status_code = response_data.get('status_code')
        attachment = False
        record = self.env[self.res_model].browse(self.res_id)
        if error:
            xml_filename = self.env['account.edi.xml.ubl_21.zatca']._export_invoice_filename(record)
            xml_filename = xml_filename[:-4] + '-rejected.xml'
            attachment = self.env['ir.attachment'].create({
                'raw': xml_content,
                'name': xml_filename,
                'description': 'Rejected ZATCA Document not to be deleted - ثيقة ZATCA المرفوضة لا يجوز حذفها',
                'res_id': self.res_id,
                'res_model': self.res_model,
                'type': 'binary',
                'mimetype': 'application/xml',
            })
            title = _("Error: Invoice rejected by ZATCA")
            subtitle = _('Please check the details below and retry after addressing them:')
            content = response_data['error']
        if response_data and response_data.get('validationResults', {}).get('warningMessages'):
            bootstrap_cls, title = ("warning", _("Warning: Invoice accepted by ZATCA with warnings"))
            subtitle = _('Please check the details below:')
            content = Markup("""<b>%(status_code)s</b>%(errors)s""") % {
                "status_code": f"[{status_code}] " if status_code else "",
                "errors": Markup("<br/>").join([
                    Markup("<b>%(code)s</b> : %(message)s") % {
                        "code": m['code'],
                        "message": m['message'],
                    } for m in response_data['validationResults']['warningMessages']
                ]),
            }
        if response_data.get("error") and response_data.get("excepted"):
            bootstrap_cls, title = ("warning", _("Warning: Unable to Retrieve a Response from ZATCA"))
            subtitle = _('Please check the details below:')
            content = response_data['error']
        if status_code == 409:
            bootstrap_cls, title = ("warning", _("Warning: Invoice was already successfully reported to ZATCA"))
            subtitle = _("Please check the details below:")
            content = Markup("""<b>%(status_code)s</b>%(errors)s""") % {
                "status_code": f"[{status_code}] " if status_code else "",
                "errors": Markup("<br/>").join([
                    Markup("<b>%(code)s</b> : %(message)s") % {
                        "code": m['code'],
                        "message": m['message'],
                    } for m in response_data['validationResults']['errorMessages']
                ]),
            }
        if response_data.get("error") and not content:
            # if there is an error, but no exception or rejection in the response
            # then it is due to an internal error raised. No need to log a note
            return None

        if not response_data.get("excepted"):
            self.journal_id.l10n_sa_latest_submission_hash = self.env['account.edi.xml.ubl_21.zatca']._l10n_sa_generate_invoice_xml_hash(xml_content)

        self.message = f"{title}\n{subtitle}\n{content}\n"
        self.error_message = title if error else ''
        self._l10n_sa_create_log(notify, attachment)
        return attachment

    @api.model
    def _l10n_sa_postprocess_zatca_template(self, xml_content):
        """
        Post-process xml content generated according to the ZATCA UBL specifications. Specifically, this entails:
            -   Force the xmlns:ext namespace on the root element (Invoice). This is required, since, by default
                the generated UBL file does not have any ext namespaced element, so the namespace is removed
                since it is unused.
        """
        # Append UBLExtensions to the XML content
        ubl_extensions = etree.fromstring(self.env['ir.qweb']._render('l10n_sa_edi.export_sa_zatca_ubl_extensions'))
        root = etree.fromstring(xml_content)
        root.insert(0, ubl_extensions)

        # Force xmlns:ext namespace on UBl file
        ns_map = {'ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'}
        etree.cleanup_namespaces(root, top_nsmap=ns_map, keep_ns_prefixes=['ext'])

        return etree.tostring(root, with_tail=False).decode()

    def _l10n_sa_generate_zatca_template(self):
        """Render the ZATCA UBL file"""
        self.ensure_one()
        record = self.env[self.res_model].browse(self.res_id)
        if self.res_model == 'account.move':
            xml_content, errors = self.env['account.edi.xml.ubl_21.zatca']._export_invoice(record)
            if errors:
                return {
                    'error': _("Could not generate Invoice UBL content: %s", ", \n".join(errors)),
                    'blocking_level': 'error',
                }

            return self._l10n_sa_postprocess_zatca_template(xml_content)

    @api.model
    def _l10n_sa_submit_einvoice(self, signed_xml, PCSID_data):
        """
        Submit a generated Invoice UBL file by making calls to the following APIs:
            -   A. Clearance API: Submit a standard Invoice to ZATCA for validation, returns signed UBL
            -   B. Reporting API: Submit a simplified Invoice to ZATCA for validation
        """
        record = self.env[self.res_model].browse(self.res_id)
        clearance_data = self.journal_id._l10n_sa_api_clearance(record, signed_xml.decode(), PCSID_data)
        if error := clearance_data.get('json_errors'):
            error_msg = ''
            if status_code := error.get('status_code'):
                error_msg = Markup("<b>[%s] </b>") % status_code

            is_warning = True
            validation_results = error.get('validationResults', {})
            for err in validation_results.get('warningMessages', []):
                error_msg += Markup('<b>%s</b> : %s <br/>') % (err['code'], err['message'])
            for err in validation_results.get('errorMessages', []):
                is_warning = False
                error_msg += Markup('<b>%s</b> : %s <br/>') % (err['code'], err['message'])
            return {
                'error': error_msg,
                'rejected': not is_warning,
                'response': signed_xml.decode(),
                'blocking_level': 'warning' if is_warning else 'error',
                'status_code': status_code,
            }
        if not clearance_data.get('error') and clearance_data.get("status_code") != 409:
            return self._l10n_sa_assert_clearance_status(clearance_data)
        return clearance_data

    def _l10n_sa_postprocess_einvoice_submission(self, signed_xml, clearance_data):
        """
        Once an invoice has been successfully submitted, it is returned as a Cleared invoice, on which data
        from ZATCA was applied. To be overridden to account for other cases, such as Reporting.
        """
        record = self.env[self.res_model].browse(self.res_id)
        if record._l10n_sa_is_simplified():
            # if invoice is B2C, it is a SIMPLIFIED invoice, and thus it is only reported and returns
            # no signed invoice. In this case, we just return the original content
            return signed_xml.decode()
        return b64decode(clearance_data['clearedInvoice']).decode()

    def _l10n_sa_apply_qr_code(self, xml_content):
        """Apply QR code on Invoice UBL content"""
        root = etree.fromstring(xml_content)
        record = self.env[self.res_model].browse(self.res_id)
        qr_code = record.l10n_sa_qr_code_str
        qr_node = root.xpath('//*[local-name()="ID"][text()="QR"]/following-sibling::*/*')[0]
        qr_node.text = qr_code
        return etree.tostring(root, with_tail=False)

    @api.model
    def _l10n_sa_get_signed_xml(self, unsigned_xml, certificate):
        """
        Helper method to sign the provided XML, apply the QR code in the case if Simplified invoices (B2C), then
        return the signed XML
        """
        record = self.env[self.res_model].browse(self.res_id)
        signed_xml = self._l10n_sa_sign_xml(unsigned_xml, certificate, record.l10n_sa_invoice_signature)
        if record._l10n_sa_is_simplified():
            # Applying with_prefetch() to set the _prefetch_ids = _ids,
            # preventing premature QR code computation for other invoices.
            record = record.with_prefetch()
            return self._l10n_sa_apply_qr_code(signed_xml)
        return signed_xml

    @api.model
    def _l10n_sa_export_zatca_invoice(self, xml_content=None):
        """
        Generate a ZATCA compliant UBL file, make API calls to authenticate, sign and include QR Code and
        Cryptographic Stamp, then create an attachment with the final contents of the UBL file
        """
        # Prepare UBL invoice values and render XML file
        unsigned_xml = xml_content or self._l10n_sa_generate_zatca_template()

        # Load PCISD data and certificate
        try:
            PCSID_data, certificate = self.journal_id._l10n_sa_api_get_pcsid()
        except UserError as e:
            return ({
                'error': e.args[0],
                'blocking_level': 'error',
                'response': unsigned_xml,
            }, unsigned_xml)

        certificate_sudo = self.env['certificate.certificate'].sudo().browse(certificate)

        # Apply Signature/QR code on the generated XML document
        try:
            signed_xml = self._l10n_sa_get_signed_xml(unsigned_xml, certificate_sudo)
        except UserError:
            return ({
                'error': _("Something went wrong. Please retry, and if that does not work, then onboard the journal again."),
                'blocking_level': 'error',
                'response': unsigned_xml,
            }, unsigned_xml)

        # Once the XML content has been generated and signed, we submit it to ZATCA
        return self._l10n_sa_submit_einvoice(signed_xml, PCSID_data), signed_xml

    # @api.model
    def _l10n_sa_check_seller_missing_info(self, invoice):
        """Helper function to check if ZATCA mandated partner fields are missing for the seller"""
        partner_id = invoice.company_id.partner_id.commercial_partner_id
        missing_fields = []
        if not partner_id.state_id:
            missing_fields.append(_('State'))
        if not partner_id.city:
            missing_fields.append(_('City'))
        return missing_fields

    @api.model
    def _l10n_sa_check_buyer_missing_info(self, invoice):
        """Helper function to check if ZATCA mandated partner fields are missing for the buyer"""
        partner_id = invoice.commercial_partner_id
        missing = []
        identification_scheme = partner_id.l10n_sa_edi_additional_identification_scheme
        if (
            any(
                tax.l10n_sa_exemption_reason_code in ('VATEX-SA-HEA', 'VATEX-SA-EDU')
                for tax in invoice.invoice_line_ids.filtered(
                    lambda line: line.display_type == 'product',
                ).tax_ids
            )
            and (
                identification_scheme != 'NAT'
                or not partner_id.l10n_sa_edi_additional_identification_number
            )
        ):
            missing.append(_(
                "Please set the Identification Scheme as National ID and Identification Number as the respective "
                "number on the Customer as the Tax Exemption Reason is set either as VATEX-SA-HEA or VATEX-SA-EDU",
            ))
        if identification_scheme == 'TIN' and not partner_id.vat:
            missing.append(_("Please set the VAT Number as the Identification Scheme is Tax Identification Number"))
        return missing

    def _l10n_sa_post_zatca_edi(self, notify=False):  # no batch ensure that there is only one invoice
        """Post invoice to ZATCA and return a dict of invoices and their success/attachment"""
        # Chain integrity check: chain head must have been REALLY posted, and did not time out
        # When a submission times out, we reset the chain index of the invoice to False, so it has to be submitted again
        # According to ZATCA, if we end up submitting the same invoice more than once, they will directly reach out
        # to the taxpayer for clarifications
        self.ensure_one()
        record = self.env[self.res_model].browse(self.res_id)
        chain_head = self._l10n_sa_get_chain_head()
        if chain_head and chain_head != record and not chain_head._l10n_sa_is_in_chain():
            self.l10n_sa_edi_chain_head_id = chain_head
            self.state = 'error'
            self.message = _("Error: This invoice is blocked due to %s. Please check it.", chain_head.name)
            self.error_message = self.message
            self._l10n_sa_create_log(notify)
            return

        xml_content = None
        if not record.l10n_sa_chain_index:
            # If the Invoice doesn't have a chain index, it means it either has not been submitted before,
            # or it was submitted and rejected. Either way, we need to assign it a new Chain Index and regenerate
            # the data that depends on it before submitting (UUID, XML content, signature)
            record.l10n_sa_chain_index = self.journal_id._l10n_sa_edi_get_next_chain_index()
            xml_content = record._l10n_sa_generate_unsigned_data()

        # Generate Invoice name for attachment
        attachment_name = False
        if self.res_model == 'account.move':
            attachment_name = self.env['account.edi.xml.ubl_21.zatca']._export_invoice_filename(record)

        # Generate XML, sign it, then submit it to ZATCA
        response_data, submitted_xml = self._l10n_sa_export_zatca_invoice(xml_content)

        # Check for submission errors
        if error := response_data.get('error'):

            # If the request returned an exception (Timeout, ValueError... etc.) it means we're not sure if the
            # invoice was successfully cleared/reported, and thus we keep the Index Chain.
            # Else, we recalculate the submission Index (ICV), UUID, XML content and Signature
            if response_data.get('excepted'):
                self.state = 'unknown'
            else:
                record.l10n_sa_chain_index = False
                self.state = 'error'

            # If the request was rejected, we save the signed xml content as an attachment
            # If request timedout, just log note a warning message
            self._l10n_sa_log_results(submitted_xml, notify, response_data, error=response_data.get('rejected'))
            return

        # Once submission is done with no errors, check submission status
        cleared_xml = self._l10n_sa_postprocess_einvoice_submission(submitted_xml, response_data)

        # Set 'l10n_sa_edi_is_production' to True upon the first invoice submission in Production mode
        if not record.company_id.l10n_sa_edi_is_production:
            record.company_id.l10n_sa_edi_is_production = record.company_id.l10n_sa_api_mode == 'prod'

        # Save the submitted/returned invoice XML content once the submission has been completed successfully
        if response_data.get('validationResults', {}).get('warningMessages'):
            self.state = 'warning'
        else:
            self.state = 'accepted'
        self.journal_id._l10n_sa_reset_chain_head_error()
        self.attachment_id = self.env['ir.attachment'].create({
                    'name': attachment_name,
                    'raw': cleared_xml.encode(),
                    'res_model': self.res_model,
                    'res_id': self.res_id,
                    'mimetype': 'application/xml',
                })
        self._l10n_sa_log_results(cleared_xml.encode(), notify, response_data)
        return

    def _l10n_sa_get_chain_head(self):
        self.ensure_one()
        if self.res_model == 'account.move':
            record = self.env[self.res_model].browse(self.res_id)
            return record.journal_id._l10n_sa_get_last_posted_doc()

    def _l10n_sa_is_in_chain(self):
        """
        If the invoice was successfully posted and confirmed by the government, then this would return True.
        If the invoice timed out, then its edi_document should still be in the 'to_send' state.
        """
        return not any(self.filtered(lambda d: d.state == 'to_send'))

    @api.model
    def _l10n_sa_get_invoice_content_edi(self, invoice):
        """Return contents of the submitted UBL file or generate it if the invoice has not been submitted yet"""
        doc = invoice.l10n_sa_edi_document_id.filtered(lambda d: d.state == 'accepted')
        return doc.attachment_id.raw or self._l10n_sa_generate_zatca_template(invoice).encode()
