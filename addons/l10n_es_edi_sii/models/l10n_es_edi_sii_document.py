import base64
import json
import requests

from odoo import api, models, fields
from odoo.tools import zeep
from odoo.addons.certificate.tools import CertificateAdapter

EUSKADI_CIPHERS = "DEFAULT:!DH"

AEAT_BASE_URL = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii_1_1/fact/ws"
AEAT_TEST_BASE_URL = "https://prewww1.aeat.es/wlpl/SSII-FACT/ws"

BIZKAIA_BASE_URL = "https://www.bizkaia.eus/ogasuna/sii/documentos"
BIZKAIA_TEST_BASE_URL = "https://pruapps.bizkaia.eus/SSII-FACT/ws"

GIPUZKOA_BASE_URL = "https://egoitza.gipuzkoa.eus/ogasuna/sii/ficheros/v1.1"
GIPUZKOA_TEST_BASE_URL = "https://sii-prep.egoitza.gipuzkoa.eus/JBS/HACI/SSII-FACT/ws"


class L10nEsEdiSiiDocument(models.Model):
    _name = 'l10n_es_edi_sii.document'
    _description = 'SII Document'
    _order = 'create_date desc'

    move_id = fields.Many2one(
        comodel_name='account.move',
        required=True,
        ondelete='cascade',
    )
    company_id = fields.Many2one(
        comodel_name='res.company',
        related='move_id.company_id',
    )
    state = fields.Selection(
        selection=[
            ('to_send', "To Send"),
            ('accepted', "Accepted"),
            ('accepted_with_errors', "Accepted with Errors"),
            ('to_cancel', "To Cancel"),
            ('cancelled', "Cancelled"),
        ],
        string="State",
        default='to_send',
        required=True,
    )
    csv = fields.Char(
        string="CSV",
        help="Secure Verification Code returned by the SII",
    )
    attachment_id = fields.Many2one(
        comodel_name='ir.attachment',
        string="SII JSON Payload",
        ondelete='restrict',
        help="The full JSON payload (Header + Body) sent to the SII.",
    )
    response_message = fields.Html(
        string="Response",
    )
    sii_json_file = fields.Binary(
        string="Download JSON",
        compute='_compute_sii_json_file',
    )
    sii_json_filename = fields.Char(
        string="JSON Filename",
        compute='_compute_sii_json_file',
    )

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------

    def _compute_sii_json_file(self):
        for doc in self:
            doc.sii_json_filename = doc._get_attachment_name()
            if doc.attachment_id:
                doc.sii_json_file = base64.b64encode(doc.attachment_id.raw).decode('utf-8')
            else:
                communication_type = 'A1' if doc.move_id.l10n_es_edi_csv and doc.state != 'to_cancel' else 'A0'
                header = self._get_web_service_header(doc.company_id, communication_type)
                info_list = doc.move_id._l10n_es_edi_get_invoices_info()
                full_payload = {'Cabecera': header, 'Cuerpo': info_list}
                json_str = json.dumps(full_payload, indent=4).encode('utf-8')
                doc.sii_json_file = base64.b64encode(json_str).decode('utf-8')

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    def _get_attachment_name(self):
        self.ensure_one()
        return f"sii_{self.move_id.name.replace('/', '_')}_{self.id}.json"

    def action_download_json(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/l10n_es_edi_sii.document/{self.id}/sii_json_file?download=true',
            'target': 'self',
        }

    @api.model
    def _get_web_service_header(self, company, communication_type):
        """Returns the common XML header dict required by the SII web service."""
        return {
            'IDVersionSii': '1.1',
            'Titular': {
                'NombreRazon': company.name[:120] if company.name else '',
                'NIF': company.vat[2:] if company.vat and company.vat.startswith('ES') else company.vat,
            },
            'TipoComunicacion': communication_type,
        }

    @api.model
    def _get_agency_urls(self, company, is_sale):
        """Returns the specific endpoint URLs for the company's tax agency."""
        agency = company.l10n_es_sii_tax_agency
        BASE_URLS = {
            "aeat":     (AEAT_BASE_URL, AEAT_TEST_BASE_URL),
            "bizkaia":  (BIZKAIA_BASE_URL, BIZKAIA_TEST_BASE_URL),
            "gipuzkoa": (GIPUZKOA_BASE_URL, GIPUZKOA_TEST_BASE_URL),
        }

        if agency not in BASE_URLS:
            return {}

        base_url, test_base_url = BASE_URLS[agency]
        suffix = "Emitidas" if is_sale else "Recibidas"
        test_path = "fe/SiiFactFEV1SOAP" if is_sale else "fr/SiiFactFRV1SOAP"

        return {
            "url": f"{base_url}/SuministroFact{suffix}.wsdl",
            "test_url": f"{test_base_url}/{test_path}",
        }

    @api.model
    def _send_batch_to_sii(self, batch_moves, target_state='to_send'):
        """
        Prepares the batch payload and executes the web service call.
        Passes the response off to _process_batch_response to create records.
        """
        if not batch_moves:
            return

        company = batch_moves[0].company_id
        is_sale = batch_moves[0].is_sale_document()
        comm_type = 'A1' if batch_moves[0].l10n_es_edi_csv and target_state != 'to_cancel' else 'A0'

        move_payloads = {}
        for move in batch_moves:
            errors = move._l10n_es_sii_check_move_configuration()
            if errors:
                move.message_post(body=self.env._("SII Configuration Error: %s") % "\n".join(errors))
                continue
            move_payloads[move] = move._l10n_es_edi_get_invoices_info()[0]

        if not move_payloads:
            return

        header = self._get_web_service_header(company, comm_type)
        connection_vals = self._get_agency_urls(company, is_sale)

        if not connection_vals:
            for move in move_payloads:
                move.message_post(body=self.env._("SII Error: Unknown tax agency."))
            return

        try:
            with requests.Session() as session:
                session.cert = company.l10n_es_sii_certificate_id
                session.mount('https://', CertificateAdapter(ciphers=EUSKADI_CIPHERS))
                client = zeep.Client(connection_vals['url'], operation_timeout=30, timeout=30, session=session)

                suffix = "Emitidas" if is_sale else "Recibidas"
                service_name = f'SuministroFact{suffix}'
                if company.l10n_es_sii_test_env and not connection_vals.get('test_url'):
                    service_name += 'Pruebas'

                serv = client.bind('siiService', service_name)
                if company.l10n_es_sii_test_env and connection_vals.get('test_url'):
                    serv._binding_options['address'] = connection_vals['test_url']

                info_list = list(move_payloads.values())
                if target_state == 'to_cancel':
                    if is_sale:
                        res = serv.AnulacionLRFacturasEmitidas(header, info_list)
                    else:
                        res = serv.AnulacionLRFacturasRecibidas(header, info_list)
                else:
                    if is_sale:
                        res = serv.SuministroLRFacturasEmitidas(header, info_list)
                    else:
                        res = serv.SuministroLRFacturasRecibidas(header, info_list)

        except requests.exceptions.SSLError:
            self._handle_batch_error(move_payloads, header, self.env._("The SSL certificate could not be validated."))
            return
        except (zeep.exceptions.Error, requests.exceptions.ConnectionError) as error:
            self._handle_batch_error(move_payloads, header, self.env._("Networking error:\n%s", error))
            return
        except Exception as error:  # noqa: BLE001
            self._handle_batch_error(move_payloads, header, str(error))
            return

        if not res:
            self._handle_batch_error(move_payloads, header, self.env._("The web service is not responding"))
            return

        self._process_batch_response(move_payloads, res, target_state, header)

    @api.model
    def _handle_batch_error(self, move_payloads, header, error_msg):
        """ create an error document for network/timeout errors """
        attachment = self._create_batch_attachment(move_payloads, header)
        for move in move_payloads:
            move.message_post(body=error_msg)
            self.sudo().create({
                'move_id': move.id,
                'state': 'to_send',
                'response_message': error_msg,
                'attachment_id': attachment.id if attachment else False,
            })

    @api.model
    def _create_batch_attachment(self, move_payloads, header):
        """ Make ONE attachment for all of the documents in the batch """
        try:
            frozen_payloads = [payload for payload in move_payloads.values()]
            full_payload = json.dumps({'Cabecera': header, 'Cuerpo': frozen_payloads}, indent=4)
            return self.env['ir.attachment'].sudo().create({
                'name': f"sii_batch_payload_{fields.Datetime.now().strftime('%Y%m%d%H%M%S')}.json",
                'raw': full_payload.encode('utf-8'),
                'mimetype': 'application/json',
            })
        except Exception:
            return False

    @api.model
    def _process_batch_response(self, move_payloads, res, target_state, header):
        """
        Parses the Zeep dictionary response, maps the lines to the original moves,
        and generates the appropriate attachment records.
        """
        res_dict = dict(res)
        if 'RespuestaLinea' not in res_dict:
            self._handle_batch_error(move_payloads, header, self.env._("SII Error: Invalid response structure."))
            return

        csv_number = res_dict.get('CSV')

        resp_lineas = res_dict.get('RespuestaLinea', [])
        if not isinstance(resp_lineas, list):
            resp_lineas = [resp_lineas]

        batch_attachment = self._create_batch_attachment(move_payloads, header)

        for move, line_resp in zip(move_payloads.keys(), resp_lineas):
            line_dict = dict(line_resp)
            estado = line_dict.get('EstadoRegistro', 'Desconocido')
            err_code = line_dict.get('CodigoErrorRegistro', '')
            err_desc = line_dict.get('DescripcionErrorRegistro', 'Unknown Error')

            if err_code == 1117 and not self.env.context.get('error_1117'):
                move.with_context(error_1117=True)._send_l10n_es_sii_document(cancel=target_state == 'to_cancel')
                continue

            dup_dict = dict(line_dict.get('RegistroDuplicado') or {})
            if (dup_dict and dup_dict.get('EstadoRegistro') == 'Correcta') or (target_state == 'to_cancel' and err_code == 3001):
                state = 'accepted'
                msg = self.env._("Duplicated/Already processed.")
            elif estado in ('Correcto', 'Correcta'):
                state = 'cancelled' if target_state == 'to_cancel' else 'accepted'
                msg = self.env._("SII: Invoice accepted successfully.")
            elif estado == 'AceptadoConErrores':
                state = 'accepted_with_errors'
                msg = self.env._("Accepted with errors: %s - %s") % (err_code, err_desc)
            else:
                state = 'to_send'
                msg = self.env._("Rejected: %s - %s") % (err_code, err_desc)

            move.message_post(body=msg)

            self.sudo().create({
                'move_id': move.id,
                'csv': csv_number or move.l10n_es_edi_csv,
                'state': state,
                'response_message': msg,
                'attachment_id': batch_attachment.id if batch_attachment else False
            })
