from base64 import b64encode
from cryptography.hazmat.primitives import hashes
from datetime import datetime, timedelta
from lxml import etree
from pytz import timezone
from werkzeug.urls import url_quote_plus, url_encode

import hashlib
import math
import requests.exceptions
import xmltodict

from odoo import _, api, fields, models
from odoo.addons.l10n_es.models.http_adapter import PatchedHTTPAdapter
from odoo.addons.l10n_es.models.xml_utils import get_xades_template_render_values, sign_xades
from odoo.exceptions import UserError
from odoo.tools import cleanup_xml_node, float_repr, float_round, zeep

import odoo.release


VERIFACTU_VERSION = "1.0"

NS_MAP = {
    'ds': 'http://www.w3.org/2000/09/xmldsig#',
    'soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
}

BATCH_LIMIT = 1000


def _sha256(string):
    hash_string = hashlib.sha256(string.encode('utf-8'))
    return hash_string.hexdigest().upper()


class L10nEsEdiVerifactuDocumentParseError(Exception):
    pass


class L10nEsEdiVerifactuDocument(models.Model):
    """Veri*Factu Document
    It represents an internal record / event in the Veri*Factu XML format as specified by the AEAT.
    It i.e. ...
      * stores the XML
      * handles the sending of the XML to the AEAT
      * stores information extracted from the received response

    The main function to generate Veri*Factu Documents is `_mark_records_for_next_batch`:
      1. It generates the documents (submission or cancellation)
         * The documents form a chain in generation order by including a reference to the preceding document.
         * The function handles the correct chaining.
      2. It sends them (and any other unsent documents) directly to the AEAT if possible (see below).

    We can not necessarily send the documents directly after generation.
    This is because the AEAT requires a waiting time between shipments (or reaching 1000 new records to send).
    The waiting time is usually 60 seconds.
    In case we cannot send the records directly a cron will be triggered at the next possible time.

    Note that (succesfully generated) Documents can not be deleted.
    This is since the Documents form a chain (in generation order) by including a reference to the preceding document.
    The chain also includes documents that are (/ possibly will be) rejected by the AEAT.
    """
    _name = 'l10n_es_edi_verifactu.document'
    _description = "Veri*Factu Document"
    _order = 'create_date DESC, id DESC'

    company_id = fields.Many2one(
        string="Company",
        comodel_name='res.company',
        required=True,
        readonly=True,
    )
    move_id = fields.Many2one(
        string="Journal Entry",
        comodel_name='account.move',
        readonly=True,
    )
    chain_index = fields.Integer(
        string="Chain Index",
        copy=False,
        readonly=True,
        help="Index in the chain of Veri*Factu Documents. It is only set if the XML generation was succesful.",
    )
    record_identifier = fields.Json(
        string="Veri*Factu Record Identifier",
        help="Technical field containing the values used to identify records in the Veri*Factu system.",
        readonly=True,
    )
    document_type = fields.Selection(
        string="Document Type",
        selection=[
            ('submission', "Submission"),
            ('cancellation', "Cancellation"),
        ],
        readonly=True,
        required=True,
    )
    xml_attachment_id = fields.Many2one(
        string="XML Attachment",
        comodel_name='ir.attachment',
        readonly=True,
    )
    xml_attachment_filename = fields.Char(
        string="XML Filename",
        compute='_compute_xml_attachment_filename',
    )
    # To use the 'binary' widget in the form view to download the attachment
    xml_attachment_base64 = fields.Binary(
        string="XML Attachment (Base64)",
        related='xml_attachment_id.datas',
    )
    errors = fields.Html(
        string="Errors",
        copy=False,
        readonly=True,
    )
    response_csv = fields.Char(
        string="Response CSV",
        help="The CSV of the response from the tax agency. There may not be one in case all documents of the batch were rejected.",
        copy=False,
        readonly=True,
    )
    state = fields.Selection(
        string="Status",
        selection=[
            ('rejected', "Rejected"),
            ('registered_with_errors', "Registered with Errors"),
            ('accepted', "Accepted"),
        ],
        help="""- Rejected: Successfully sent to the AEAT, but it was rejected during validation
                - Registered with Errors: Registered at the AEAT, but the AEAT has some issues with the sent record
                - Accepted: Registered by the AEAT without errors""",
        copy=False,
        readonly=True,
    )

    @api.depends('document_type')
    def _compute_display_name(self):
        for document in self:
            document.display_name = _("Verifactu Document %s", document.id)

    @api.depends('document_type')
    def _compute_xml_attachment_filename(self):
        for document in self:
            document_type = 'annulacion' if document.document_type == 'cancellation' else 'alta'
            name = f"verifactu_registro_{document.id}_{document_type}.xml"
            document.xml_attachment_filename = name

    @api.model
    def _format_errors(self, title, errors):
        error = {
            'error_title': title,
            'errors': errors,
        }
        return self.env['account.move.send']._format_error_html(error)

    @api.model
    def _check_record_values(self, vals):
        errors = []

        company = vals['company']

        company_values = company._l10n_es_edi_verifactu_get_values()
        company_NIF = company_values['NIF']
        if not company_NIF or len(company_NIF) != 9:  # NIFType
            errors.append(_("The NIF '%(company_NIF)s' of the company is not exactly 9 characters long.",
                            company_NIF=company_NIF))

        name = vals['name']
        if not name or len(name) > 60:
            errors.append(_("The name of the record is not between 1 and 60 characters long: %(name)s.",
                            name=name))

        certificate = company.sudo()._l10n_es_edi_verifactu_get_certificate()
        if not certificate:
            errors.append(_("There is no certificate configured for Veri*Factu on the company."))

        invoice_date = vals['invoice_date']
        if not invoice_date:
            errors.append(_("The invoice date is missing."))

        move_type = vals['move_type']
        if move_type not in ['out_invoice', 'out_refund']:
            errors.append(_("The record has to be an invoice or a credit note."))

        tax_details = vals['tax_details']
        sujeto_tax_types = self.env['account.tax']._l10n_es_get_sujeto_tax_types()
        ignored_tax_types = ['ignore', 'retencion']
        supported_tax_types = sujeto_tax_types + ignored_tax_types + ['no_sujeto', 'no_sujeto_loc', 'recargo', 'exento']
        tax_type_description = self.env['account.tax']._fields['l10n_es_type'].get_description(self.env)
        for tax_detail in tax_details['tax_details'].values():
            tax_type = tax_detail['l10n_es_type']
            verifactu_tax_type = tax_detail['l10n_es_edi_verifactu_tax_type']
            if tax_type not in supported_tax_types:
                # tax_type in ('no_deducible', 'dua')
                # The remaining tax types are purchase taxes (for vendor bills).
                errors.append(_("A tax with value '%(tax_type)s' as %(field)s is not supported.",
                                field=tax_type_description['string'],
                                tax_type=dict(tax_type_description['selection'])[tax_type]))
            elif tax_type in ('no_sujeto', 'no_sujeto_loc') and verifactu_tax_type == '01':
                tax_percentage = tax_detail['amount']
                tax_amount = tax_detail['tax_amount']
                if float_round(tax_percentage, precision_digits=2) or float_round(tax_amount, precision_digits=2):
                    errors.append(_("No Sujeto VAT taxes must have 0 amount."))

        return errors

    def _create_for_record(self, record_values, previous_record_identifier=None):
        """Note: In case we succesfully create an XML we delete all linked documents that failed the XML creation."""
        company = record_values['company']
        document_vals = record_values['document_vals']
        generation_errors = record_values['errors']

        xml = None
        if generation_errors:
            error_title = _("The Veri*Factu document could not be created")
            document_vals['errors'] = self._format_errors(error_title, generation_errors)
        else:
            xml_node, render_vals = self._render_xml_node(
                record_values, previous_record_identifier=previous_record_identifier,
            )
            xml = etree.tostring(xml_node, xml_declaration=False, encoding='UTF-8')
            document_vals.update({
                'record_identifier': render_vals['record_identifier'],
                'chain_index': company._l10n_es_edi_verifactu_get_next_chain_index(),
            })

        document = self.create(document_vals)

        if xml:
            record = record_values['record']
            document.xml_attachment_id = self.env['ir.attachment'].create({
                'raw': xml,
                'name': document.xml_attachment_filename,
                'res_id': record.id,
                'res_model': record._name,
                'mimetype': 'application/xml',
            })
            record_values['documents'].filtered(lambda rd: not rd.xml_attachment_id).unlink()

        return document

    def _mark_records_for_next_batch(self, record_values_list):
        """Create Veri*Factu documents for input `record_values_list`.
        Return a dictionary (record -> document) containing all the created documents.
        In case we already have documents waiting to be sent for a record it is skipped (no new document is created).
        The documents are also created in case the XML generation fails; to inspect the errors.
        Such documents are deleted in case the XML generation succeeds for a record at a later time (see `_create_for_record`).
        :param list record_values_list: list of record values dictionaries (to be passed to `_create_for_record`)
        """
        result = {}

        # Group the records per company
        grouped_record_values_list = {}
        for record_values in record_values_list:
            company = record_values['company']
            grouped_record_values_list.setdefault(company, []).append(record_values)

        for company, company_record_values_list in grouped_record_values_list.items():
            # We chain all the created documents per company in generation order.
            # Thus we can not generate multiple documents for the same company at the same time.
            # We use `company.l10n_es_edi_verifactu_chain_sequence_id` to
            #   * explicitly number the documents in order
            #   * prevent the concurrent creation of documents (see the following code block)
            try:
                chain_sequence = company.l10n_es_edi_verifactu_chain_sequence_id
                self.env['res.company']._with_locked_records(chain_sequence)
            except UserError:
                continue

            previous_document = self.env['l10n_es_edi_verifactu.document'].search(
                [('chain_index', '!=', False)], order='chain_index asc', limit=1,
            )
            for record_values in record_values_list:
                if record_values['documents']._filter_waiting():
                    continue
                document = self.env['l10n_es_edi_verifactu.document']._create_for_record(
                    record_values, previous_record_identifier=previous_document.record_identifier,
                )
                if document.state != 'error':
                    previous_document = document
                result[record_values['record']] = document
        self.env['l10n_es_edi_verifactu.document'].trigger_next_batch()
        return result

    @api.model
    def trigger_next_batch(self):
        """
        1. Send all waiting documents that we can send
        2. Trigger the cron again at a later date to send the documents we could not send
        """
        unsent_domain = [
            ('xml_attachment_id', '!=', False),
            ('state', '=', False),
        ]
        documents_per_company = self._read_group(
            unsent_domain,
            groupby=['company_id'],
            aggregates=['id:recordset'],
        )

        if not documents_per_company:
            return

        next_trigger_time = None
        for company, documents in documents_per_company:
            # Avoid sending a document twice due to concurrent calls to `trigger_next_batch`
            # TODO: Maybe lock the whole company (or sth verifactu specific on the company; or the whole cron) to be safe
            try:
                self.env['res.company']._with_locked_records(documents)
            except UserError:
                # We will later make sure that we trigger the cron again
                continue

            # We choose the language since this function may be executed on the cron.
            langs = documents.create_uid.mapped('lang')
            lang = 'es_ES' if 'es_ES' in langs else langs[0]
            # We sort the `documents` to batch them in the order they were chained
            documents = documents.sorted('chain_index').with_context(lang=lang)

            # Send batches with size BATCH_LIMIT; they are not restricted by the waiting time
            next_batch = documents[0:BATCH_LIMIT]
            start_index = 0
            while len(next_batch) == BATCH_LIMIT:
                next_batch.with_company(company)._send_as_batch()
                start_index += BATCH_LIMIT
                next_batch = documents[start_index:start_index + BATCH_LIMIT]
            # Now: len(next_batch) < BATCH_LIMIT ; we need to respect the waiting time

            if not next_batch:
                continue

            next_batch_time = company.l10n_es_edi_verifactu_next_batch_time
            if not next_batch_time or fields.Datetime.now() >= next_batch_time:
                next_batch.with_company(company)._send_as_batch()
            else:
                # Since we have a `next_batch_time` the `next_trigger_time` will be set to a datetime
                # We set it to the minimum of all the already encountered `next_batch_time`
                next_trigger_time = min(next_trigger_time or datetime.max, next_batch_time)

        # In case any of the documents were not successfully sent we trigger the cron again in 60s
        # (or at the next batch time if the 60s is earlier)
        for company, documents in documents_per_company:
            unsent_documents = documents.filtered_domain(unsent_domain)
            next_batch_time = company.l10n_es_edi_verifactu_next_batch_time
            if unsent_documents:
                # Trigger in 60s or at the next batch time (except if there is an earlier trigger already)
                in_60_seconds = fields.Datetime.now() + timedelta(seconds=60)
                company_next_trigger_time = max(in_60_seconds, next_batch_time or datetime.min)
                # Set `next_trigger_time` to the minimum of all the already encountered trigger times
                next_trigger_time = min(next_trigger_time or datetime.max, company_next_trigger_time)

        if next_trigger_time:
            cron = self.env.ref('l10n_es_edi_verifactu.cron_verifactu_batch', raise_if_not_found=False)
            if cron:
                cron._trigger(at=next_trigger_time)

    @api.model
    def _get_zeep_operation(self, operation):
        company = self.env.company

        session = requests.Session()

        settings = zeep.Settings(forbid_entities=False)
        # TODO: endpoint
        wsdl = company._l10n_es_edi_verifactu_get_endpoints()['wsdl']
        client = zeep.Client(wsdl['url'], operation_timeout=60, timeout=60, session=session, settings=settings)

        # TODO: mounting before creating `client` causes an error
        session.cert = company.sudo()._l10n_es_edi_verifactu_get_certificate()
        session.mount('https://', PatchedHTTPAdapter())

        service = client.bind(wsdl['service'], wsdl['port'])
        return service[wsdl[operation]]

    @api.model
    def _get_zeep_registration_operation(self):
        return self._get_zeep_operation('registration')

    @api.model
    def _send_batch(self, batch_dict):

        # TODO: timeouts etc
        operation = self._get_zeep_registration_operation()

        info = {
            'errors': [],
            'record_info': {},
        }
        errors = info['errors']
        record_info = info['record_info']

        try:
            res = operation(batch_dict['Cabecera'], batch_dict['RegistroFactura'])
            # `res` is of type 'zeep.client.SerialProxy'
        except requests.exceptions.SSLError:
            errors.append(_("The SSL certificate could not be validated."))
        except (zeep.exceptions.TransportError, requests.exceptions.ConnectionError) as error:
            # TODO: log tracebacks / details
            certificate_error = "No autorizado. Se ha producido un error al verificar el certificado presentado"
            if certificate_error in error.message:
                errors.append(_("The document could not be sent; the access was denied due to a problem with the certificate."))
            else:
                errors.append(_("Networking error:\n%s", error))
        except zeep.exceptions.Fault as soapfault:
            info['state'] = 'rejected'
            errors.append(f"[{soapfault.code}] {soapfault.message}")
        except zeep.exceptions.Error as error:
            errors.append(_("Error sending the document:\n%s", error))

        if errors:
            return info

        # TODO: AttributeError in case element was not found
        received_batch_state = res['EstadoEnvio']
        batch_state = {
            'Incorrecto': 'rejected',
            'ParcialmenteCorrecto': 'registered_with_errors',
            'Correcto': 'accepted',
        }[received_batch_state]

        info.update({
            'response_csv': res['CSV'] if 'CSV' in res else None,
            'waiting_time_seconds': int(res['TiempoEsperaEnvio']),
            'state': batch_state,
        })

        for response_line in res['RespuestaLinea']:
            record_id = response_line['IDFactura']
            invoice_issuer = record_id['IDEmisorFactura'].strip()
            invoice_name = record_id['NumSerieFactura'].strip()
            # TODO: ?: add date
            # invoice_date = record_id['FechaExpedicionFactura'].strip()
            record_key = str((invoice_issuer, invoice_name))

            operation_type = response_line['Operacion']['TipoOperacion']

            received_state = response_line['EstadoRegistro']
            state = {
                'Incorrecto': 'rejected',
                'AceptadoConErrores': 'registered_with_errors',
                'Correcto': 'accepted',
            }[received_state]

            errors = []
            if state in ('rejected', 'registered_with_errors'):
                error_code = response_line['CodigoErrorRegistro']
                error_description = response_line['DescripcionErrorRegistro']
                errors.append(f"[{error_code}] {error_description}")
            record_info[record_key] = {
                'state': state,
                'cancellation': operation_type == 'Anulacion',
                'errors': errors,
            }

        return info

    # TODO: remove
    @api.model
    def xml_to_dict(self, xml):
        def clean(value):
            if isinstance(value, dict):
                return {
                    key.split(':', 1)[1]: clean(value)
                    for key, value in value.items()
                    if not key.startswith("@")
                   }
            elif isinstance(value, list):
                return [clean(v) for v in value]
            else:
                return value

        xml_dict = xmltodict.parse(xml)
        return clean(xml_dict)


    def _send_as_batch(self):
        # Documents in `self` should all belong to `self.env.company`

        # When the document is sent more than 240s after its creation the AEAT registers the document only with an error
        # See error with code 2004:
        #   El valor del campo FechaHoraHusoGenRegistro debe ser la fecha actual del sistema de la AEAT,
        #   admitiéndose un margen de error de: 240 segundos.
        incident = any(document.create_date > self.env.cr.now() + timedelta(seconds=240) for document in self)

        document_xmls = [document.xml_attachment_id.raw.decode() for document in self]
        # For the cron we specifically set the `self.env.company`
        batch_xml, batch_errors = self.with_company(self.env.company)._batch_record_xmls(document_xmls, incident=incident)
        if batch_errors:
            error_title = _("The batch document could not be created")
            self.errors = self._format_errors(error_title, batch_errors)
            info = {'errors': batch_errors}
            return None, info

        batch_dict = self.xml_to_dict(batch_xml)['RegFactuSistemaFacturacion']

        info = self._send_batch(batch_dict)

        # Store the information from the response split over the individual documents
        document_infos = self._get_document_infos(self, info)
        for document, response_info in document_infos.items():
            # The errors have to be formatted (as HTML) before storing them on the document
            errors_html = False
            error_list = response_info.get('errors', [])
            if error_list:
                error_title = _("Error")
                if response_info.get('state', False):
                    error_title = _("The Veri*Factu document contains the following errors according to the AEAT")
                errors_html = self._format_errors(error_title, error_list)
            document.errors = errors_html

            # All other values can be stored directly on the document
            keys = ['response_csv', 'state']
            for key in keys:
                new_value = response_info.get(key, False)
                if new_value or document[key]:
                    document[key] = new_value

        waiting_time_seconds = info.get('waiting_time_seconds')
        if waiting_time_seconds:
            now = fields.Datetime.to_datetime(fields.Datetime.now())
            next_batch_time = now + timedelta(seconds=waiting_time_seconds)
            self.env.company.l10n_es_edi_verifactu_next_batch_time = next_batch_time

        if self.env['account.move']._can_commit():
            self._cr.commit()

        return batch_xml, info

    @api.model
    def _get_document_infos(self, documents, info):
        batch_state = info.get('state')
        result = {}
        for document in documents:
            record_key = self._get_record_key(document)
            record_info = info.get('record_info', {})
            response_info = None
            if not batch_state and info['errors']:
                # Handle case that something went wrong while sending or parsing the respone
                response_info = {'errors': info['errors']}
            elif record_info:
                # We expect an entry for `record_identifier`.
                # If there is none we "build" one; it indicates a parsing failure.
                response_info = record_info.get(record_key, None)
                if response_info is None:
                    response_info = {
                        'errors': [_("We could not find any information about the record in the linked batch document.")],
                    }
            else:
                # I.e. in case of soapfault and access denied there is no `record_info`.
                # So we just return the global 'state' / 'errors'.
                response_info = {
                    'state': info['state'],
                    'errors': info['errors'],
                }

            # Add some information from the batch level in any case.
            response_info.update({
                'waiting_time_seconds': info.get('waiting_time_seconds', False),
                'response_csv': info.get('response_csv', False),
            })

            result[document] = response_info

        return result

    @api.model
    def _get_record_key(self, document):
        record_identifier = document.record_identifier
        return str((record_identifier['IDEmisorFactura'], record_identifier['NumSerieFactura']))

    @api.ondelete(at_uninstall=False)
    def _never_unlink_chained_documents(self):
        for document in self:
            if document.chain_index:
                raise UserError(_("You cannot delete Veri*Factu Documents that are part of the chain of all Veri*Factu Documents."))

    @api.model
    def _format_date_fecha_type(self, date):
        # Format as 'fecha' type from xsd
        return date.strftime('%d-%m-%Y')

    @api.model
    def _round_format_number_2(self, number):
        # Round and format as number with 2 precision digits
        if number is None:
            return None
        rounded = float_round(number, precision_digits=2)
        return float_repr(rounded, precision_digits=2)

    # We do not check / fix the number of digits in front of the decimal separator
    _format_number_ImporteSgn12_2 = _round_format_number_2
    _format_number_Tipo2_2 = _round_format_number_2

    @api.model
    def _render_vals(self, vals, previous_record_identifier=None):
        cancellation = vals['cancellation']
        company = vals['company']
        record_type = 'RegistroAnulacion' if cancellation else 'RegistroAlta'
        render_vals = {
            'company': company,
            'record_type': record_type,
            'record': vals['record'],
            'cancellation': cancellation,
            'errors': [],
            'vals': vals,
            'previous_record_identifier': previous_record_identifier,
        }

        company_values = company._l10n_es_edi_verifactu_get_values()
        generation_time_string = fields.Datetime.now(timezone('Europe/Madrid')).astimezone(timezone('Europe/Madrid')).isoformat()
        render_vals.update({
            'verifactu_version': VERIFACTU_VERSION,
            'company_name': company_values['name'],
            'generation_time_string': generation_time_string,
        })

        render_vals_functions = [
            self._render_vals_operation,
            self._render_vals_previous_submissions,
            self._render_vals_monetary_amounts,
            self._render_vals_dsig,
            self._render_vals_SistemaInformatico,
        ]
        for function in render_vals_functions:
            new_render_vals = function(vals)
            render_vals.update(new_render_vals)

        self._update_render_vals_with_chaining_info(render_vals)

        record_identifier = self._extract_record_identifiers(render_vals)
        render_vals['record_identifier'] = record_identifier

        return render_vals

    @api.model
    def _get_tipos(self, vals):
        move_type = vals['move_type']
        is_simplified = vals['is_simplified']

        result = {
            'TipoFactura': None,
            'TipoRectificativa': None,
        }
        if move_type == 'out_invoice':
            result['TipoFactura'] = 'F2' if is_simplified else 'F1'
        else:
            # move_type == 'out_refund':
            result.update({
                'TipoFactura': 'R5' if is_simplified else 'R1',
                'TipoRectificativa': 'I',
            })
        return result

    @api.model
    def _render_vals_operation(self, vals):
        render_vals = {}

        company = vals['company']
        cancellation = vals['cancellation']
        invoice_date = self._format_date_fecha_type(vals['invoice_date'])
        is_simplified = vals['is_simplified']
        name = vals['name']
        partner = vals['partner']

        company_values = company._l10n_es_edi_verifactu_get_values()
        company_NIF = company_values['NIF']

        render_vals.update({
            'company_NIF': company_NIF,
            'invoice_name': name,
            'invoice_date': invoice_date,
        })

        if cancellation:
            return render_vals

        simplified_partner = self.env.ref('l10n_es.partner_simplified', raise_if_not_found=False)
        partner_is_simplified_partner = simplified_partner and partner == simplified_partner

        render_vals['partner_info'] = {}
        if partner and not partner_is_simplified_partner:
            render_vals['partner_info'].update({
                'NombreRazon': (partner.name or '')[:120],
                ** partner._l10n_es_edi_get_partner_info(),
            })

        delivery_date = vals['delivery_date']
        if delivery_date:
            delivery_date = self._format_date_fecha_type(delivery_date)

        tipos = self._get_tipos(vals)

        render_vals.update({
            'tipo_factura': tipos['TipoFactura'],
            'tipo_rectificativa': tipos['TipoRectificativa'],  # may be None
            'fecha_operacion': delivery_date if delivery_date and delivery_date != invoice_date else None,
            'descripcion_operacion': vals['description'] or 'manual',
            'simplificada_art7273': 'S' if is_simplified and partner and not partner_is_simplified_partner else None,
            'sin_identif_destinatario_art61d': 'S' if is_simplified and partner_is_simplified_partner else None,
        })

        refunded_document = vals['refunded_document']
        if refunded_document:
            refunded_record_identifier = refunded_document.record_identifier
            render_vals.update({
                'refunded_record': {
                    'IDEmisorFactura': refunded_record_identifier['IDEmisorFactura'],
                    'NumSerieFactura': refunded_record_identifier['NumSerieFactura'],
                    'FechaExpedicionFactura': refunded_record_identifier['FechaExpedicionFactura'],
                },
            })

        return render_vals

    @api.model
    def _render_vals_previous_submissions(self, vals):
        # See "Sistemas Informáticos de Facturación y Sistemas VERI*FACTU" Version 1.0.0 - "Validaciones" p. 22 f.
        render_vals = {}

        verifactu_state = vals['verifactu_state']
        submission_rejected_before = vals['rejected_before']
        # `record_exists_at_AEAT` means the move / pos order is known at the AEAT
        record_exists_at_AEAT = verifactu_state in ('registered_with_errors', 'accepted')

        if vals['cancellation']:
            render_vals = {
                # A cancelled record can e.g. not exist at the AEAT when we switch to Veri*Factu after the original invoice was created
                'sin_registro_previo': 'S' if not record_exists_at_AEAT else 'N',
                'rechazo_previo': 'S' if submission_rejected_before else 'N',
            }
        else:
            substitution = record_exists_at_AEAT  # TODO: case correction of record that does not exist at aeat yet
            if substitution and not record_exists_at_AEAT:
                # Cases: ALTA DE SUBSANACIÓN SIN REGISTRO PREVIO, ALTA POR RECHAZO DE SUBSANACIÓN SIN REGISTRO PREVIO
                # This can i.e. happen when switching to Veri*Factu after the original invoice was created
                previously_rejected_state = 'X'
            elif submission_rejected_before:
                # Cases: ALTA POR RECHAZO, ALTA POR RECHAZO DE SUBSANACIÓN
                previously_rejected_state = 'S' if substitution else 'X'
            else:
                # Cases: ALTA, ALTA DE SUBSANACIÓN
                previously_rejected_state = None  # 'N'
            render_vals = {
                # We only put 'N' for 'Subsanacion' in case ALTA (we also put 'S' in case ALTA POR RECHAZO)
                'subsanacion': 'S' if substitution or submission_rejected_before else 'N',
                'rechazo_previo': previously_rejected_state,
            }

        return render_vals

    @api.model
    def _render_vals_monetary_amounts(self, vals):
        if vals['cancellation']:
            return {}

        sujeto_tax_types = self.env['account.tax']._l10n_es_get_sujeto_tax_types()

        detalles = []
        tax_details = vals['tax_details']

        recargo_tax_details_key = {}  # dict (tax_key -> recargo_tax_key)
        for tax_details_per_record in tax_details['tax_details_per_record'].values():
            record_tax_details = tax_details_per_record['tax_details']
            main_key = None
            recargo_key = None
            # Note: We assume there is only a single (main_tax, recargo_tax) on a single line
            for key in record_tax_details:
                if key['with_recargo']:
                    main_key = key
                if key['l10n_es_type'] == 'recargo':
                    recargo_key = key
                if main_key and recargo_key:
                    break
            recargo_tax_details_key[main_key] = recargo_key

        sign = -1 if vals['move_type'] in ('out_refund', 'in_refund') else 1
        for key, tax_detail in tax_details['tax_details'].items():
            tax_type = tax_detail['l10n_es_type']
            # Tax types 'ignore' and 'retencion' are ignored when generating the `tax_details`
            # See `filter_to_apply` in function `_l10n_es_edi_verifactu_get_tax_details_functions` on 'account.tax'
            if tax_type == 'recargo':
                # Recargo taxes are only used in combination with another tax (a sujeto tax)
                # They will be handled when processing the remaining taxes
                continue

            exempt_reason = tax_detail['l10n_es_exempt_reason']  # only set if exempt

            tax_percentage = tax_detail['amount']
            base_amount = sign * tax_detail['base_amount']
            tax_amount = math.copysign(tax_detail['tax_amount'], base_amount)

            verifactu_tax_type = tax_detail['l10n_es_edi_verifactu_tax_type']
            clave_regimen = tax_detail['ClaveRegimen']
            if clave_regimen == '06' or verifactu_tax_type in ('02', '05'):
                base_amount_no_sujeto = 0
                base_amount_sujeto = base_amount
            else:
                base_amount_no_sujeto = base_amount
                base_amount_sujeto = None

            calificacion_operacion = None  # Reported if not tax-exempt;
            recargo_equivalencia = {}
            if tax_type in sujeto_tax_types:
                calificacion_operacion = 'S2' if tax_type == 'sujeto_isp' else 'S1'
                if tax_detail['with_recargo']:
                    recargo_key = recargo_tax_details_key.get(key)
                    recargo_tax_detail = tax_details['tax_details'][recargo_key]
                    recargo_tax_percentage = recargo_tax_detail['amount']
                    recargo_tax_amount = math.copysign(recargo_tax_detail['tax_amount'], base_amount)
                    recargo_equivalencia.update({
                        'tax_percentage': recargo_tax_percentage,
                        'tax_amount': recargo_tax_amount,
                    })
            elif tax_type in ('no_sujeto', 'no_sujeto_loc'):
                calificacion_operacion = 'N2' if tax_type == 'no_sujeto_loc' else 'N1'
            else:
                # tax_type == 'exento' (see `_check_record_values`)
                pass  # exempt_reason set already

            recargo_percentage = recargo_equivalencia.get('tax_percentage')
            recargo_amount = recargo_equivalencia.get('tax_amount')

            # Note on the TipoImpositivo and CuotaRepercutida tags.
            # In some cases it makes a difference for the validation whether the tags are output with 0
            # or not at all:
            # - In the no sujeto cases (calification_operacion in ('N1', 'N2')) we may not include them.
            # - In the (calification_operacion == S2) case the tags have to be included with value 0.
            #
            # See the following errors
            # [1198]
            #     Si CalificacionOperacion es S2 TipoImpositivo y CuotaRepercutida deberan tener valor 0.
            # [1237]
            #     El valor del campo CalificacionOperacion está informado como N1 o N2 y el impuesto es IVA.
            #     No se puede informar de los campos TipoImpositivo (excepto con ClaveRegimen 17),
            #     CuotaRepercutida (excepto con ClaveRegimen 17), TipoRecargoEquivalencia y CuotaRecargoEquivalencia.
            if calificacion_operacion in ('N1', 'N2') and verifactu_tax_type == '01':
                tax_percentage = None
                tax_amount = None

            detalle = {
                'Impuesto': verifactu_tax_type,
                'ClaveRegimen': clave_regimen,
                'CalificacionOperacion': calificacion_operacion,
                'OperacionExenta': exempt_reason,
                'TipoImpositivo': self._format_number_Tipo2_2(tax_percentage),
                'BaseImponibleOimporteNoSujeto': self._format_number_ImporteSgn12_2(base_amount_no_sujeto),
                'BaseImponibleACoste': self._format_number_ImporteSgn12_2(base_amount_sujeto),
                'CuotaRepercutida': self._format_number_ImporteSgn12_2(tax_amount),
                'TipoRecargoEquivalencia': self._format_number_Tipo2_2(recargo_percentage),
                'CuotaRecargoEquivalencia': self._format_number_ImporteSgn12_2(recargo_amount),
            }

            detalles.append(detalle)

        total_amount = sign * (tax_details['base_amount'] + tax_details['tax_amount'])
        tax_amount = sign * (tax_details['tax_amount'])

        render_vals = {
            'macrodato': 'S' if abs(total_amount) >= 100000000 else None,
            'detalles': detalles,
            'tax_amount': self._format_number_ImporteSgn12_2(tax_amount),
            'total_amount': self._format_number_ImporteSgn12_2(total_amount),
        }

        return render_vals

    @api.model
    def _get_db_identifier(self):
        database_uuid = self.env['ir.config_parameter'].sudo().get_param('database.uuid')
        return _sha256(database_uuid)

    @api.model
    def _render_vals_SistemaInformatico(self, vals):
        spanish_companies_on_db_count = self.env['res.company'].search_count([
            ('account_fiscal_country_id.code', '=', 'ES'),
        ], limit=2)

        render_vals = {
            'sistema_informatico': {
                'NombreRazon': 'ODOO ERP SP SL',
                'NIF': 'B72659014',
                'NombreSistemaInformatico': odoo.release.product_name,
                'IdSistemaInformatico': '00',  # identifies Odoo the software as product of Odoo the company
                'Version': odoo.release.version,
                'NumeroInstalacion':  self._get_db_identifier(),
                'TipoUsoPosibleSoloVerifactu': 'S',
                'TipoUsoPosibleMultiOT': 'S',
                'IndicadorMultiplesOT': 'S' if spanish_companies_on_db_count > 1 else 'N',
            },
        }

        return render_vals

    @api.model
    def _render_vals_dsig(self, vals):
        company = vals['company']

        certificate = company.sudo()._l10n_es_edi_verifactu_get_certificate()
        _cert_private, cert_public = certificate.sudo()._get_key_pair()
        sigpolicy = {
            'url': 'https://sede.administracion.gob.es/politica_de_firma_anexo_1.pdf',
            'digest': b64encode(cert_public.fingerprint(hashes.SHA256())).decode(),
        }
        render_vals = get_xades_template_render_values(sigpolicy, cert_public)

        return render_vals

    def _extract_record_identifiers(self, render_vals):
        """Return a dictionary that includes:
          * the IDFactura fields
          * the fields used for the fingerprint generation of this document and the next one
            (The fingerprint of this record is part of the fingerprint generation of the next record)
          * the fields used for QR code generation
        """
        identifiers = {
            'IDEmisorFactura': render_vals['company_NIF'],
            'NumSerieFactura': render_vals['invoice_name'],
            'FechaExpedicionFactura': render_vals['invoice_date'],
            'FechaHoraHusoGenRegistro': render_vals['generation_time_string'],
            'Huella': render_vals['huella'],
        }
        if not render_vals['cancellation']:
            identifiers.update({
                'TipoFactura': render_vals['tipo_factura'],
                'CuotaTotal': render_vals['tax_amount'],
                'ImporteTotal': render_vals['total_amount'],
            })
        return identifiers

    @api.model
    def _update_render_vals_with_chaining_info(self, render_vals):
        predecessor = (render_vals['previous_record_identifier'] or {})
        first_registration = not bool(predecessor)

        render_vals['chaining'] = {
            'PrimerRegistro': "S" if first_registration else None,
            'IDEmisorFactura': predecessor.get('IDEmisorFactura'),
            'NumSerieFactura': predecessor.get('NumSerieFactura'),
            'FechaExpedicionFactura': predecessor.get('FechaExpedicionFactura'),
            'Huella': predecessor.get('Huella'),
        }

        # During the `_fingerprint` computation the 'Encadenamiento' info needs to be set already
        render_vals.update({
            'first_registration': first_registration,
            'tipo_huella': "01",  # "01" means SHA-256
            'huella': self._fingerprint(render_vals),
        })

        return render_vals

    @api.model
    def _fingerprint(self, render_vals):
        """
        Documentation: "Detalle de las especificaciones técnicas para generación de la huella o hash de los registros de facturación"
        """
        if render_vals['cancellation']:
            fingerprint_values = [
                ('IDEmisorFacturaAnulada', render_vals['company_NIF']),
                ('NumSerieFacturaAnulada', render_vals['invoice_name']),
                ('FechaExpedicionFacturaAnulada', render_vals['invoice_date']),
                ('Huella', render_vals['chaining']['Huella'] or ''),
                ('FechaHoraHusoGenRegistro', render_vals['generation_time_string']),
            ]
            string = "&".join([f"{field}={value.strip()}" for (field, value) in fingerprint_values])
        else:
            fingerprint_values = [
                ('IDEmisorFactura', render_vals['company_NIF']),
                ('NumSerieFactura', render_vals['invoice_name']),
                ('FechaExpedicionFactura', render_vals['invoice_date']),
                ('TipoFactura', render_vals['tipo_factura']),
                ('CuotaTotal', render_vals['tax_amount']),
                ('ImporteTotal', render_vals['total_amount']),
                ('Huella', render_vals['chaining']['Huella'] or ''),
                ('FechaHoraHusoGenRegistro', render_vals['generation_time_string']),
            ]
            string = "&".join([f"{field}={value.strip()}" for (field, value) in fingerprint_values])
        return _sha256(string)

    @api.model
    def _render_xml_node(self, record_values, previous_record_identifier=None):
        render_vals = self._render_vals(
            record_values, previous_record_identifier=previous_record_identifier,
        )

        # Render
        xml = self.env['ir.qweb']._render('l10n_es_edi_verifactu.verifactu_registro_factura', render_vals)
        xml_node = cleanup_xml_node(xml, remove_blank_nodes=False, indent_space='    ')

        # # Sign the rendered XML (modify <ds:Signature> node appropriately)
        # company = render_vals['company']
        # certificate = company.sudo()._l10n_es_edi_verifactu_get_certificate()
        # cert_private, _cert_public = certificate.sudo()._get_key_pair()
        # signature_node = xml_node.find('*/ds:Signature', namespaces=NS_MAP)
        # sign_xades(signature_node, cert_private)

        return xml_node, render_vals

    def _filter_waiting(self):
        return self.filtered(lambda doc: not doc.state and doc.xml_attachment_id)

    def _get_last(self, document_type):
        return self.filtered(lambda doc: doc.document_type == document_type).sorted()[:1]

    def _get_state(self):
        last_registered_document = self.filtered(lambda doc: doc.state in ('registered_with_errors', 'accepted')).sorted()[:1]
        if last_registered_document:
            cancellation = last_registered_document.document_type == 'cancellation'
            return 'cancelled' if cancellation else last_registered_document.state

        rejected_document = self.filtered(lambda doc: doc.state == 'rejected')[:1]
        if rejected_document:
            return 'rejected'

        return False

    @api.model
    def _batch_record_xmls(self, xml_list, incident=False):
        errors = []

        company = self.env.company
        company_values = company._l10n_es_edi_verifactu_get_values()
        company_NIF = company_values['NIF']

        # TODO: check company NIF

        render_vals = {
            'sender_name': company_values['name'],
            'sender_NIF': company_NIF,
            'incident': 'S' if incident else 'N',
        }
        batch_xml = self.env['ir.qweb']._render('l10n_es_edi_verifactu.verifactu_record_registration', render_vals)
        batch_xml_node = cleanup_xml_node(batch_xml, remove_blank_nodes=False, indent_space='    ')
        for xml in xml_list:
            batch_xml_node.append(etree.fromstring(xml))

        if errors:
            return None, errors

        batch_xml = etree.tostring(batch_xml_node, xml_declaration=True, encoding='UTF-8')
        return batch_xml, errors

    def _get_qr_code_img_url(self):
        self.ensure_one()
        record_identifier = self.record_identifier
        if not record_identifier or self.document_type != 'submission':
            # We take the values from the record identifier.
            # And only the 'submission' has all the necessary values ('ImporteTotal').
            return False
        endpoint_url = self.company_id._l10n_es_edi_verifactu_get_endpoints()['QR']
        url_params = url_encode({
            'nif': record_identifier['IDEmisorFactura'],
            'numserie': record_identifier['NumSerieFactura'],
            'fecha': record_identifier['FechaExpedicionFactura'],
            'importe': record_identifier['ImporteTotal'],
        })
        url = url_quote_plus(f"{endpoint_url}?{url_params}")
        return f'/report/barcode/?barcode_type=QR&value={url}&barLevel=M&width=180&height=180'
