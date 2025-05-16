import base64
import requests
from odoo import _, models, fields
from odoo.exceptions import ValidationError


class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_id_pajakio_trx_id = fields.Char(readonly=True, copy=False)
    l10n_id_pajakio_trx_uploaded = fields.Boolean(default=False, copy=False, readonly=True)
    l10n_id_pajakio_trx_url = fields.Char(readonly=True, copy=False)
    l10n_id_pajakio_nofa = fields.Char(readonly=True, copy=False)
    l10n_id_failure_reason = fields.Text(readonly=True)

    def _pajakio_get_api_key_encoded(self):
        """Get the base64 encoded API key from pajak.io"""
        key = self.company_id.l10n_id_pajakio_api_key
        if not key:
            raise ValidationError(_("Pajak IO API key has not been set, please configure it in settings"))
        key_encoded = base64.b64encode(key.encode("utf-8"))
        return key_encoded.decode("utf-8")

    def _pajakio_make_request(self, url, data={}):
        """ Helper method to create an API request in Pajak IO"""
        key = self._pajakio_get_api_key_encoded()
        if not key:
            raise ValidationError(_("Please configure your pajak.io API key on the Accountin Settings page"))

        header = {"Authorization": key, "isJsonUsingCallback": "True", "isFileUsingCallback": "True"}
        try:
            response = requests.post(url, headers=header, json=data, timeout=10)
            response.raise_for_status()
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            raise ValidationError("PajakIO: " + _("Could not establish connection to the API."))
        except requests.exceptions.HTTPError as err:
            err_message = err.response.json().get('message')
            raise ValidationError("PajakIO: " +  _("Communication with API failed. PajakIO"
                                                   " returned the following  error: '%s'", err_message))
        return response.json()

    def _pajakio_prepare_payload(self):
        """ payload for /efaktur/penjualan"""
        vals = self.prepare_efaktur_vals()[0]
        d = {
            'TIN': 'NPWP',
            'NIK': 'NIK',
            'Passport': 'PASPOR',
            'Other': 'LAINNYA'
        }
        document = d[vals['BuyerDocument']]
        res = {
            "autoUploadDjp": False,
            "pengganti": False,
            "noInvoice": vals["RefDesc"],
            "kdJenisTransaksi": 'TD.003' + vals['TrxCode'],
            "lawanTransaksi": {
                "identityType": document,
                "identityValue": self.partner_id.vat if document == "NPWP" else vals["BuyerDocumentNumber"],
                "nitku": vals["BuyerIDTKU"],
                # "npwp": vals["BuyerTin"],
                "nama": vals["BuyerName"],
                "alamatJalan": vals["BuyerAdress"],
                "kota": self.partner_id.city,
                "kodeNegara": vals["BuyerCountry"],
            },
            "masaPajak": self.invoice_date.strftime("%m"),
            "tahunPajak": self.invoice_date.strftime("%Y"),
            "tanggalFaktur": vals["TaxInvoiceDate"],
            "tarifPpn": 11.0,
            # "terminPembayaran": "0",
            "barangJasa": [{
                "jenis": "JASA" if line["Opt"] == "B" else "BARANG",
                "kode": line["Code"],
                "nama": line["Name"],
                "jumlah": line["Qty"],
                "kodeSatuan": line["Unit"],
                "harga": line["Price"],
                "totalHarga": line["Price"] * line["Qty"],
                "diskon": line["TotalDiscount"],
                "tarifPpn": line["VATRate"],
                "dpp": line["TaxBase"],
                "cekDppLain": True if self.l10n_id_kode_transaksi == "04" else False,
                "dppLain": line["OtherTaxBase"],
                "ppn": line["VAT"],
                "tarifPpnbm": 0,
                "ppnbm": 0
            } for line in vals["lines"]],
            "terminPembayaran": {
                "type": "NORMAL"
            }
        }
        
        return res


    def pajakio_submit_efaktur(self):
        """ Method to submit the document to the govt"""
        self._pre_efaktur_download_check()
        payload = self._pajakio_prepare_payload()
        url = "https://sandbox-openapi.pajak.io/efaktur/v3/penjualan"

        res = self._pajakio_make_request(url, payload)
        transaction_id = res.get("data", {}).get("transactionId")

        self.l10n_id_pajakio_trx_id = transaction_id


    def pajakio_upload_efaktur(self):
        """ Method to upload the document to the govt"""
        if not self.l10n_id_pajakio_trx_id:
            raise ValidationError(_("PajakIO transaction ID not found, please submit the document first"))

        url = "https://sandbox-openapi.pajak.io/efaktur/v3/penjualan/upload"
        payload = {
            "transactionId": self.l10n_id_pajakio_trx_id,
        }

        res = self._pajakio_make_request(url, payload)
        # set to uploaded if the status is OK
        if res.get('status') == "OK":
            self.l10n_id_pajakio_trx_uploaded = True

    def pajakio_get_status(self):
        # TODO: ask if there is API to get data of multiple transaction IDs at once
        if not self.l10n_id_pajakio_trx_id:
            raise ValidationError(_("PajakIO transaction ID not found, please submit the document first"))

        url = "https://sandbox-openapi.pajak.io/efaktur/v3/penjualan/" + self.l10n_id_pajakio_trx_id

        self.l10n_id_failure_reason = ""  # reset failure reason everytime we're about to re-send the detail
        res = self._pajakio_make_request(url)
        status = res.get("data", {}).get("status")
        if status == "APPROVAL_SUKSES":
            self.l10n_id_pajakio_trx_url = res.get('data').get('urlPdf')
            self.l10n_id_pajakio_nofa = res.get('data').get('nofa')
        elif status == "DITOLAK":
            self.l10n_id_failure_reason = res.get('data').get('keteranganDjp')
        return res

    def cron_pajakio_get_status(self):
        """ Regular check for status of the document, shoudl only apply to
        the documents who has been uploaded but no URL yet """
        # get all the documents that has been uploaded but no URL yet
        moves = self.search([('l10n_id_pajakio_trx_uploaded', '=', True), '|', ('l10n_id_pajakio_trx_url', '=', ''), ('l10n_id_pajakio_trx_url', '=', False)])
        for move in moves:
            try:
                res = move.pajakio_get_status()
                status = res.get("data", {}).get("status")
                if status == "APPROVAL_SUKSES":
                    move.l10n_id_pajakio_trx_url = res.get('data').get('urlPdf')
            except ValidationError as e:
                # notify the user there's an error during retrieval
                move.message_post(body=_("PajakIO, failure when getting status: %s", str(e)))

    def _reset_pajakio(self):
        """ Handling of when invoice is being reset to draft or cancelled

        When invoice is being reset to draft or cancelled, we're assuming that user wants to change something on the invoice
        or cancel it in general.
        If the invoice has been uploaded, then we have to cancel it.
        If not uploaded yet, we can assume user wants to create new one, so we just empty pajakio fields to allow user to re-submit.
        """
        for move in self:
            if move.l10n_id_pajakio_trx_uploaded:
                # call API to cancel transaction
                try:
                    res = self._pajakio_make_request(
                        "https://sandbox-openapi.pajak.io/efaktur/v3/penjualan/batal",
                        {"transactionId": move.l10n_id_pajakio_trx_id}
                    )
                    if res.get("status") == "OK":
                        move.l10n_id_pajakio_trx_uploaded = False
                        message = _("PajakIO: transaction has been cancelled")
                except ValidationError as e:
                    message = _(str(e))

                move.message_post(body=message)
        
            # reset all fields to empty to allow re-submitting flow
            move.l10n_id_pajakio_trx_uploaded = False
            move.l10n_id_pajakio_trx_id = ""
            move.l10n_id_failure_reason = ""
            move.l10n_id_pajakio_trx_url = ""
            move.l10n_id_pajakio_nofa = ""

    def button_draft(self):
        """ Override the button_draft method to handle cancellation """
        super().button_draft()
        self._reset_pajakio()
    
    def button_cancel(self):
        """ Override the button_cancel method to handle cancellation """
        super().button_cancel()
        self._reset_pajakio()

    def open_coretax_document(self):
        """ Open the coretax document """
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('PajakIO Document'),
            'res_model': 'l10n_id_efaktur_coretax.document',
            'view_mode': 'form',
            'res_id': self.l10n_id_coretax_document.id,
        }
