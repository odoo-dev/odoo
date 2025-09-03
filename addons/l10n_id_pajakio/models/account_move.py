import logging
from odoo import _, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

class AccountMove(models.Model):
    _inherit = "account.move"


    # Pajak.io related fields
    # NOTE: at the moment, we want to limit 1 database to be associated to just 1 account
    # this is due to the fact that each database can only have 1 IAP account and therefore
    # paid credit management will be difficult to manage if there are multiple accounts
    # in the same database
    l10n_id_pajakio_transaction_id = fields.Char(
        string="Pajak.io Transaction ID",
        readonly=True,
        copy=False,
        help="Unique identifier of invoices created in pajak.io"
    )
    l10n_id_pajakio_uploaded = fields.Boolean(
        string="Uploaded to Pajak.io",
        readonly=True,
        copy=False,
        help="Indicates whether the invoice has been uploaded n pajak.io"
    )
    l10n_id_pajakio_trx_url = fields.Char(
        string="Pajak.io Transaction URL",
        readonly=True,
        copy=False,
        help="URL to view the invoice receipt validated in pajak.io"
    )
    l10n_id_pajakio_nofa = fields.Char(
        string="Pajak.io Invoice Number",
        readonly=True,
        copy=False,
        help="Inoivce number assigned by pajak.io"
    )
    l10n_id_pajakio_failure_reason = fields.Text(
        string="Pajak.io Failure Reason",
        readonly=True,
        copy=False,
        help="Reason for failure during the invoice upload to DJP"
    )
    l10n_id_pajakio_status = fields.Selection(
        [
            ("waiting", "Waiting for Approval"),
            ('approved', "Approved"),
            ('rejected', "Rejected"),
            ('cancel', "Cancelled")
        ],
        string="Pajak.io Status",
        readonly=True,
        copy=False,
        help="Current status of the transaction in pajak.io",
    )

    def _prepare_invoice_payload_pajakio(self):
        """ Using standard method `_l10n_id_coretax_build_invoice_vals` to generate values
        which will then be converted to the data fitting for API. 
        Since the API method will always be batched, we will always prepare a list of values as well """
        
        efaktur_vals = self.prepare_efaktur_vals()
        payload = []

        document_type_mapping = {
            "TIN": "NPWP",
            "NIK": "NIK",
            "Passport": "PASPOR",
            "Other": "LAINNYA"
        }

        for efaktur, move in zip(efaktur_vals, self):
            document = document_type_mapping.get(efaktur["BuyerDocument"], "NIK")

            payload.append({
                "autoUploadDjp": False,
                "pengganti": False,
                "noInvoice": efaktur["RefDesc"],
                "kdJenisTransaksi": 'TD.003' + efaktur['TrxCode'],
                "lawanTransaksi": {
                    "identityType": document,
                    "identityValue": efaktur["BuyerDocumentNumber"] if document != "NPWP" else efaktur["BuyerTin"],
                    "nitku": efaktur["BuyerIDTKU"],
                    "nama": efaktur["BuyerName"],
                    "alamatJalan": efaktur["BuyerAdress"],
                    "kodeNegara": efaktur["BuyerCountry"],
                },
                "masaPajak": move.invoice_date.strftime("%m"),
                "tahunPajak": move.invoice_date.strftime("%Y"),
                "tanggalFaktur": efaktur["TaxInvoiceDate"],
                "tarifPpn": 11.0,
                "barangJasa": [{
                    "jenis": "JASA" if line["Opt"] == "B" else "BARANG",
                    "kode": line["Code"],
                    "nama": line["Name"],
                    "jumlah": float(line["Qty"]),
                    "kodeSatuan": line["Unit"],
                    "harga": float(line["Price"]),
                    "totalHarga": float(line["Price"]) * float(line["Qty"]),
                    "diskon": float(line["TotalDiscount"]),
                    "tarifPpn": float(line["VATRate"]),
                    "dpp": float(line["TaxBase"]),
                    "cekDppLain": True if move.l10n_id_kode_transaksi == "04" else False,
                    "dppLain": float(line["OtherTaxBase"]),
                    "ppn": float(line["VAT"]),
                    "tarifPpnbm": 0,
                    "ppnbm": 0
                } for line in efaktur["lines"]],
                "terminPembayaran": {
                    "type": "NORMAL"
                },
                "penandatangan": {
                    "nama": move.company_id.name,
                    "npwp": move.company_id.vat,
                    "jabatan": "Penandatangan",
                    "kota": move.company_id.city,
                    "passphrase": move.company_id.name
                },
                "pembuatFaktur": {
                    "npwp": move.company_id.vat,
                    "nama": move.company_id.name,
                }
            })
        return payload

    # ---------- pajakio integrations methods ----------

    def l10n_id_pajakio_generate(self):
        """ Trigger for creating the invoice payload and pass it over to the IAP side to 
        generate pajak.io faktur in batch mode"""
        payload = self._prepare_invoice_payload_pajakio()

        data = self.env['iap.account']._l10n_id_pajakio_iap_connect(
           {"invoice_payload": payload},
            "/l10n_id_pajakio/create_invoice"
        )
        _logger.info("Returned response: %s", data)
        
        if "error" in data:
            raise UserError(data["error"])

        # They will return list of results with its transaction
        transactions = data.get("transaction")
        for invoice, transaction in zip(self, transactions):
            invoice.l10n_id_pajakio_transaction_id = transaction.get("transactionId")


    def l10n_id_pajakio_upload(self):
        """ Uplaod the invoice for review by DJP """

        # ensure all involved invoices have transaction_id
        if self.filtered(lambda m: not m.l10n_id_pajakio_transaction_id):
            raise UserError(_("Some of the selected invoices have not been generated in pajak.io. Please generate the invoice first before uploading."))

        transaction_ids = self.mapped("l10n_id_pajakio_transaction_id")
        response = self.env['iap.account']._l10n_id_pajakio_iap_connect(
            {"transaction_ids": transaction_ids},
            "/l10n_id_pajakio/upload_invoice"
        )

        _logger.info("Returned response: %s", response)
        # if successful, data should contain list of upload result
        if "error" in response:
            raise UserError(response["error"])

        # update l10n_id_pajakio_uploaded to True if it really is uploaded
        data = response.get("data")
        for move, upload_result in zip(self, data):
            if "success" in upload_result:
                move.l10n_id_pajakio_uploaded = True
                move.l10n_id_pajakio_status = "waiting"
            else:
                # log message the fact that upload is unsuccessful
                move.message_post(body=_("Failed to upload invoice to DJP: %s" % upload_result.get("error", "Unknown Reason")))

    def l10n_id_pajakio_update_status(self):
        """ Fetch the latest status of invoice from pajak.io (after uplaoded). 
        Status is either approved/rejected/waiting.
        If approved, we store the Transaction URL and invoice number.
        If rejected we store the reason why it was rejected.
        """
        # ensure all involved invoices have transaction_id
        if self.filtered(lambda m: not m.l10n_id_pajakio_transaction_id):
            raise UserError(_("Some of the selected invoices have not been generated in pajak.io."))

        transaction_ids = self.mapped("l10n_id_pajakio_transaction_id")
        response = self.env['iap.account']._l10n_id_pajakio_iap_connect(
            {"transaction_ids": transaction_ids},
            "/l10n_id_pajakio/update"
        )

        _logger.info("Returned response: %s", response)
        
        if 'error' in response:
            raise UserError(response["error"])
        
        # response data should be in the format of {'transaction_id': {..}}
        data = response.get("data")
        for move in self:
            result = data.get(move.l10n_id_pajakio_transaction_id)
            status = result["status"]
            detail = result["data"]

            # successful approval
            if status == "APPROVAL_SUKSES":
                move.l10n_id_pajakio_status = "approved"
                move.l10n_id_pajakio_trx_url = detail.get("urlPdf")
                move.l10n_id_pajakio_nofa = detail.get("nofa")
                move.l10n_id_pajakio_failure_reason = False
            # rejected
            elif status == "DITOLAK":
                move.l10n_id_pajakio_status = "rejected"
                move.l10n_id_pajakio_failure_reason = detail.get("keteranganDjp")

            # TODO; cancelled
