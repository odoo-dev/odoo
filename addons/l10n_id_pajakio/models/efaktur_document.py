import base64
import requests
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError



class EfakturDocument(models.Model):
    _inherit = "l10n_id_efaktur_coretax.document"

    # Store multiple information related to PajakIO as well here
    # TODO: handle submission of multiple efaktur documents later on
    l10n_id_pajakio_trx_id = fields.Char(readonly=True, copy=False, string="PajakIO Transaction ID")
    l10n_id_pajakio_trx_uploaded = fields.Boolean(default=False, copy=False, readonly=True, string="Uploaded to PajakIO")
    l10n_id_pajakio_trx_url = fields.Char(readonly=True, copy=False, string="PajakIO Transaction URL")
    l10n_id_pajakio_nofa = fields.Char(readonly=True, copy=False, string="PajakIO No. Faktur Pajak")
    l10n_id_pajakio_failure_reason = fields.Text(readonly=True, string="PajakIO Upload Failure Reason")
    l10n_id_pajakio_need_update = fields.Boolean(default=False, copy=False, readonly=True, string="PajakIO Update Needed")
    l10n_id_pajakio_status = fields.Char(readonly=True, copy=False, string="PajakIO Status")
    l10n_id_pajakio_invoice_type = fields.Char(readonly=True, copy=False, string="PajakIO Invoice Type")

    def _pajakio_get_api_key_encoded(self):
        """Get the base64 encoded API key from pajak.io"""
        key = self.company_id.l10n_id_pajakio_api_key
        if not key:
            raise ValidationError(_("Pajak IO API key has not been set, please configure it in settings"))
        key_encoded = base64.b64encode(key.encode("utf-8"))
        return key_encoded.decode("utf-8")

    def _pajakio_make_request(self, url, method="POST", data={}):
        """ Helper method to create an API request in Pajak IO"""
        key = self._pajakio_get_api_key_encoded()
        if not key:
            raise ValidationError(_("Please configure your PajakIO API key on the Accounting Settings Page"))

        header = {"Authorization": key, "isJsonUsingCallback": "True", "isFileUsingCallback": "True"}
        try:
            response = requests.request(method, url, json=data, headers=header, timeout=10)
            response.raise_for_status()
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            raise ValidationError("PajakIO: " + _("Could not establish connection to the API."))
        except requests.exceptions.HTTPError as err:
            err_message = err.response.json().get('message')
            raise ValidationError("PajakIO: " +  _("Communication with API failed. PajakIO"
                                                   " returned the following  error: '%s'", err_message))
        return response.json()

    def _pajakio_prepare_payload(self):
        vals = self.invoice_ids.prepare_efaktur_vals()[0]  # TODO: handle multiple invoices later on
        move = self.invoice_ids[0]  # TODO: handle multiple invoices later on
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
                "identityValue": move.partner_id.vat if document == "NPWP" else vals["BuyerDocumentNumber"],
                "nitku": vals["BuyerIDTKU"],
                "nama": vals["BuyerName"],
                "alamatJalan": vals["BuyerAdress"],
                "kota": move.partner_id.city,
                "kodeNegara": vals["BuyerCountry"],
            },
            "masaPajak": move.invoice_date.strftime("%m"),
            "tahunPajak": move.invoice_date.strftime("%Y"),
            "tanggalFaktur": vals["TaxInvoiceDate"],
            "tarifPpn": 11.0,
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
                "cekDppLain": True if move.l10n_id_kode_transaksi == "04" else False,
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

    def pajakio_submit(self):
        """ Submit the efaktur to PajakIO """
        self.ensure_one()

        payload = self._pajakio_prepare_payload()
        url = "https://sandbox-openapi.pajak.io/efaktur/v3/penjualan"
        
        res = self._pajakio_make_request(url, method="POST", data=payload)
        transaction_id = res.get("data", {}).get("transactionId")

        self.l10n_id_pajakio_trx_id = transaction_id
        self.message_post(body=_("e-Faktur has been successfully submitted to PajakIO, returns transaction ID: %s", transaction_id))

    def pajakio_upload(self):
        """ Upload the efaktur to PajakIO """
        self.ensure_one()
        if not self.l10n_id_pajakio_trx_id:
            raise ValidationError(_("Please submit the efaktur before uploading it to PajakIO"))

        url = "https://sandbox-openapi.pajak.io/efaktur/v3/penjualan/upload"
        payload = {
            "transactionId": self.l10n_id_pajakio_trx_id,
        }
        
        res = self._pajakio_make_request(url, method="POST", data=payload)
        if res.get("status") == "OK":
            self.message_post(body=_("The e-Faktur with transaction ID %s has been successfully uploaded to DJP", self.l10n_id_pajakio_trx_id))
            self.l10n_id_pajakio_trx_uploaded = True

    def pajakio_update_status(self):
        """ Update the status of the efaktur in PajakIO """
        self.ensure_one()
        if not self.l10n_id_pajakio_trx_id:
            raise ValidationError(_("Please submit the efaktur before updating its status"))

        url = f"https://sandbox-openapi.pajak.io/efaktur/v3/penjualan/{self.l10n_id_pajakio_trx_id}"
        self.l10n_id_pajakio_failure_reason = ""  # reset the failure reason everytime we try to re-send the detail
        res = self._pajakio_make_request(url)
        
        status = res.get("data", {}).get("status")
        # Post message whether success or failrue
        msg = ""
        invoice_type = res.get("data", {}).get("jenisFaktur")
        if status == "APPROVAL_SUKSES":
            self.l10n_id_pajakio_trx_url = res.get('data').get('urlPdf')
            self.l10n_id_pajakio_nofa = res.get('data').get('nofa')
            msg = _("The e-Faktur with Nomer Faktur %s has been successfully approved by the DJP. The URL is: %s", self.l10n_id_pajakio_nofa, self.l10n_id_pajakio_trx_url)
        elif status == "DITOLAK":
            self.l10n_id_pajakio_trx_uploaded = False
            self.l10n_id_pajakio_failure_reason = res.get('data').get('keteranganDjp')
            msg = _("The e-Faktur with Nomer Faktur %s has been rejected by the DJP. The reason is: %s", self.l10n_id_pajakio_nofa, self.l10n_id_pajakio_failure_reason)
        if msg:
            self.message_post(body=msg)
        self.l10n_id_pajakio_status = status
        self.l10n_id_pajakio_invoice_type = res.get('data', {}).get('jenisFaktur')
        if invoice_type == "BATAL":  # if it's cancelled invoice, reset all fields
            self.l10n_id_pajakio_trx_id = ""
            self.l10n_id_pajakio_trx_uploaded = False
            self.l10n_id_pajakio_trx_url = ""
            self.l10n_id_pajakio_nofa = ""
            self.l10n_id_pajakio_failure_reason = ""

        return res

    def pajakio_cancel(self):
        """ Cancel the eFaktur in PajakIO"""
        self.ensure_one()
        if not self.l10n_id_pajakio_trx_id:
            raise ValidationError(_("Please submit the efaktur before cancelling it"))
        
        # can only cancel once it's been approved (trx URL and nofa is made available)
        if not (self.l10n_id_pajakio_trx_url or self.l10n_id_pajakio_nofa):
            raise ValidationError(_("You can only cancel the efaktur after it has been approved by DJP"))

        url = "https://sandbox-openapi.pajak.io/efaktur/v3/penjualan/batal"
        payload = {
            "transactionId": self.l10n_id_pajakio_trx_id,
        }
        
        res = self._pajakio_make_request(url, method="POST", data=payload)
        if res.get("status") == "OK":
            self.message_post(body=_("The e-Faktur with Nomer Faktur %s has been successfully cancelled in PajakIO", self.l10n_id_pajakio_nofa))
        
        # reset all the fields to prepare for new flow
        self.l10n_id_pajakio_trx_id = ""
        self.l10n_id_pajakio_trx_uploaded = False
        self.l10n_id_pajakio_trx_url = ""
        self.l10n_id_pajakio_nofa = ""
        self.l10n_id_pajakio_failure_reason = ""

        return res

    def pajakio_update(self):
        """ Update the eFaktur uploaded to PajakIO """
        if not self.l10n_id_pajakio_trx_id:
            raise ValidationError(_("Please submit the efaktur before updating it"))

        payload = self._pajakio_prepare_payload()
        payload.update({"transactionId": self.l10n_id_pajakio_trx_id})

        res = self._pajakio_make_request("https://sandbox-openapi.pajak.io/efaktur/v3/penjualan", method="PUT", data=payload)
        if res.get("status") == "OK":
            # succesfully updated
            self.l10n_id_pajakio_need_update = False
            self.message_post(body=_("The e-Faktur with transaction ID %s has been successfully updated in PajakIO", self.l10n_id_pajakio_trx_id))

    def _generate_xml(self, regenerate=False):
        super()._generate_xml(regenerate=regenerate)
        # if user regenerate, alert that update is needed
        if regenerate and self.l10n_id_pajakio_trx_id:
            self.l10n_id_pajakio_need_update = True
