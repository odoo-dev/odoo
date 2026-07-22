# Part of Odoo. See LICENSE file for full copyright and licensing details.
#
# A heads-up before you read the code below:
#
# - RS.ge has no single-call invoice submission like some other e-invoicing APIs (e.g. Turkey,
#   Saudi Arabia, which build one XML document with the header+lines together and submit it in
#   one call). Here, an invoice is built up over several separate calls: create the header first
#   (`save_invoice`), then create each line one by one (`save_invoice_desc`), then a final call to
#   actually send it (`change_invoice_status`).
# - Methods that return a single record (e.g. `get_invoice`) come back as normal, cleanly-typed
#   SOAP responses - `zeep` (Odoo's wrapper included) parses these without any trouble.
# - Methods that return a *list* of records (e.g. `get_invoice_desc`) don't follow that same
#   pattern, and `zeep` can't parse them directly - the metadata in the response looks like a
#   legacy .NET pattern for returning a table of rows as XML. Odoo's UBL/CII parser doesn't help
#   here either, since RS.ge doesn't use the UBL format at all.
import logging
import threading

from lxml import etree
from zeep.plugins import HistoryPlugin

from odoo.tools import LazyTranslate, zeep

_lt = LazyTranslate(__name__)
_logger = logging.getLogger(__name__)

NTOSSERVICE_WSDL_URL = 'https://www.revenue.mof.ge/ntosservice/ntosservice.asmx?WSDL'

_client_cache = {}
_client_cache_lock = threading.Lock()

_RSGE_INVOICE_STATUS_MAP = {
    0: "rejected",
    1: "sent",
    2: "confirmed",
    3: "corrected_original",
    4: "new_correction",
    5: "correction_pending_confirmation",
    6: "cancel_requested",
    7: "confirmed_cancelled",
    8: "confirmed_correction",
}


def get_rsge_invoice_status(status):
    """Map an RS.ge invoice status code to its Odoo selection key, or `"unknown"` if unmapped."""
    return _RSGE_INVOICE_STATUS_MAP.get(status, "unknown")


RSGE_ERROR_MESSAGES = {
    "invalid_input": lambda detail: _lt("Invalid input: %s", detail),
    "connection": lambda detail: _lt(
        "Could not reach the RS.ge web service. Please try again later.\n%s",
        detail,
    ),
    "soap_fault": lambda detail: _lt("RS.ge returned an unexpected error.\n%s", detail),
    "rejected": lambda detail: _lt(
        "RS.ge rejected the request. Please check your credentials and try again.",
    ),
    "not_found": lambda detail: _lt("RS.ge could not find a taxpayer with this TIN."),
    "submit_failed": lambda detail: _lt(
        "RS.ge rejected the invoice while %s. Please check the invoice data and try again.",
        detail,
    ),
    "original_not_confirmed": lambda detail: _lt(
        "The original invoice must be confirmed by RS.ge before a corrective invoice can be created.",
    ),
}


class RSgeError(Exception):
    """Raised for any failure talking to RS.ge's `ntosservice.asmx` SOAP service."""

    def __init__(self, kind, message=None, raw=None):
        self.kind = kind
        self.message = message
        self.raw = raw
        super().__init__(f'[{kind}] {message}' if message else kind)


def _parse_diffgram_rows(envelope):
    """Parse an RS.ge diffgram response into a list of row dicts.

    RS.ge sends lists of records (e.g. `get_invoice_desc`) as diffgrams, so we parse them ourselves.
    """
    document_elements = envelope.xpath("//*[local-name()='DocumentElement']")
    if not document_elements:
        return []
    return [
        {etree.QName(field).localname: field.text for field in row}
        for row in document_elements[0]
    ]


def _get_wsdl_client(wsdl_url=NTOSSERVICE_WSDL_URL):
    """Return a `zeep` client for `wsdl_url`, cached for the lifetime of the process."""
    with _client_cache_lock:
        client = _client_cache.get(wsdl_url)
        if client is None:
            try:
                client = zeep.Client(wsdl_url)
            except zeep.exceptions.Error as error:
                raise RSgeError('connection', str(error)) from error
            _client_cache[wsdl_url] = client
        return client


def _get_diffgram_client(wsdl_url=NTOSSERVICE_WSDL_URL):
    """Return a fresh `(zeep client, HistoryPlugin)` pair for a single diffgram-shaped call.

    Built with an extra plugin to recover the records RS.ge sends back, as noted at the top of
    this file. Not cached either, since `HistoryPlugin` only holds one value at a time - sharing
    one instance would block concurrent calls for the duration of each network request.
    """
    history = HistoryPlugin()
    try:
        client = zeep.Client(wsdl_url, plugins=[history])
    except zeep.exceptions.Error as error:
        raise RSgeError("connection", str(error)) from error
    return client, history


class RSgeClient:
    """ Thin, Odoo-agnostic wrapper around RS.ge's `ntosservice.asmx` SOAP service. """

    def __init__(self, su, sp):
        if not su or not su.strip() or not sp or not sp.strip():
            raise RSgeError('invalid_input', "'su' and 'sp' are required and cannot be blank.")
        self.su = su
        self.sp = sp

    def _call(self, operation, **kwargs):
        service = _get_wsdl_client().service
        try:
            return getattr(service, operation)(**kwargs)
        except zeep.exceptions.Fault as fault:
            _logger.info("RS.ge %s() SOAP fault: %s", operation, fault)
            raise RSgeError('soap_fault', str(fault), raw=fault) from fault
        except zeep.exceptions.Error as error:
            _logger.info("RS.ge %s() connection error: %s", operation, error)
            raise RSgeError('connection', str(error), raw=error) from error

    def check_credentials(self):
        """Validate the service-user credentials via RS.ge's `chek` method, returning the real `user_id`."""
        # user_id is a mandatory WSDL parameter, but RS.ge's server never actually checks it (confirmed
        # empirically: any int, including 0, is accepted as long as su/sp are correct) - no need to ask for one.
        result = self._call('chek', su=self.su, sp=self.sp, user_id=0)
        if not result['chekResult']:
            _logger.info("RS.ge chek() rejected credentials, raw response: %s", result)
            raise RSgeError("rejected", raw=result)
        return result["user_id"]

    def get_un_id_from_tin(self, user_id, tin):
        """Resolve a taxpayer's TIN to RS.ge's internal `un_id`."""
        result = self._call(
            "get_un_id_from_tin",
            user_id=user_id,
            tin=tin,
            su=self.su,
            sp=self.sp,
        )
        un_id = result["get_un_id_from_tinResult"]
        if not un_id or un_id <= 0:
            _logger.info(
                "RS.ge get_un_id_from_tin() found no taxpayer, raw response: %s",
                result,
            )
            raise RSgeError("not_found", raw=result)
        return un_id

    def save_invoice(
        self,
        user_id,
        invoice_id,
        operation_date,
        seller_un_id,
        buyer_un_id,
        b_s_user_id=0,
    ):
        """Create (`invoice_id=0`) or update an invoice header via `save_invoice`, returning the resolved invoice id."""
        result = self._call(
            "save_invoice",
            user_id=user_id,
            invois_id=invoice_id,  # RS.ge's own (mis)spelling - required verbatim, see save_invoice's WSDL signature
            operation_date=operation_date,
            seller_un_id=seller_un_id,
            buyer_un_id=buyer_un_id,
            overhead_no="",  # deprecated per the protocol doc, must be passed as an empty string
            overhead_dt=operation_date,  # deprecated, but still mandatory - reuse operation_date
            b_s_user_id=b_s_user_id,
            su=self.su,
            sp=self.sp,
        )
        if not result["save_invoiceResult"]:
            raise RSgeError("submit_failed", "saving the invoice header", raw=result)
        return result["invois_id"]

    def save_invoice_line(
        self,
        user_id,
        invoice_id,
        line_id,
        goods,
        g_unit,
        g_number,
        full_amount,
        drg_amount,
        aqcizi_amount=0,
        akciz_id=0,
    ):
        """Create (`line_id=0`) or update an invoice line via `save_invoice_desc`, returning the resolved line id."""
        result = self._call(
            "save_invoice_desc",
            user_id=user_id,
            id=line_id,
            su=self.su,
            sp=self.sp,
            invois_id=invoice_id,  # RS.ge's own (mis)spelling - required verbatim
            goods=goods,
            g_unit=g_unit,
            g_number=g_number,
            full_amount=full_amount,
            drg_amount=drg_amount,
            aqcizi_amount=aqcizi_amount,
            akciz_id=akciz_id,
        )
        if not result["save_invoice_descResult"]:
            raise RSgeError("submit_failed", "saving an invoice line", raw=result)
        return result["id"]

    def delete_invoice_line(self, user_id, invoice_id, line_id):
        result = self._call(
            "delete_invoice_desc",
            user_id=user_id,
            id=line_id,
            inv_id=invoice_id,
            su=self.su,
            sp=self.sp,
        )
        if not result:
            raise RSgeError(
                "submit_failed",
                "deleting a stale invoice line",
                raw=result,
            )

    def change_invoice_status(self, user_id, invoice_id, status):
        """Change an invoice's status (e.g. `status=1` to send) via `change_invoice_status`."""
        # unlike every other method here, change_invoice_status has no ref/out WSDL params, so zeep
        # returns the plain boolean directly instead of a dict wrapping a `<method>Result` key.
        result = self._call(
            "change_invoice_status",
            user_id=user_id,
            inv_id=invoice_id,
            status=status,
            su=self.su,
            sp=self.sp,
        )
        if not result:
            raise RSgeError("submit_failed", "confirming the invoice send", raw=result)

    def get_invoice(self, user_id, invoice_id):
        """Fetch an invoice's current data (here, for the `f_series`/`f_number` assigned on send) via `get_invoice`."""
        result = self._call(
            "get_invoice",
            user_id=user_id,
            invois_id=invoice_id,
            su=self.su,
            sp=self.sp,
        )
        if not result["get_invoiceResult"]:
            raise RSgeError(
                "submit_failed",
                "fetching the invoice's assigned number",
                raw=result,
            )
        return result

    def save_k_invoice(self, user_id, invoice_id, k_type):
        """Create a corrective invoice against invoice_id via k_invoice, returning the new correction's id."""
        result = self._call(
            "k_invoice",
            user_id=user_id,
            inv_id=invoice_id,
            k_type=k_type,
            su=self.su,
            sp=self.sp,
        )
        if not result["k_invoiceResult"]:
            raise RSgeError(
                "submit_failed",
                "creating the corrective invoice",
                raw=result,
            )
        return result["k_id"]

    def get_makoreqtirebeli(self, user_id, invoice_id):
        """Return invoice_id's corrective invoice id via get_makoreqtirebeli, or None if none exists."""
        result = self._call(
            "get_makoreqtirebeli",
            user_id=user_id,
            inv_id=invoice_id,
            su=self.su,
            sp=self.sp,
        )
        if not result["get_makoreqtirebeliResult"]:
            return None
        return result["k_id"]

    def get_invoice_lines(self, user_id, invoice_id):
        """Fetch an invoice's lines from RS.ge via `get_invoice_desc`, given its header id."""
        client, history = _get_diffgram_client()
        try:
            client.service.get_invoice_desc(
                user_id=user_id,
                invois_id=invoice_id,
                su=self.su,
                sp=self.sp,
            )
        except zeep.exceptions.LookupError:
            return _parse_diffgram_rows(history.last_received["envelope"])
        except ValueError:
            return []
        except zeep.exceptions.Fault as fault:
            _logger.info("RS.ge get_invoice_desc() SOAP fault: %s", fault)
            raise RSgeError("soap_fault", str(fault), raw=fault) from fault
        except zeep.exceptions.Error as error:
            _logger.info("RS.ge get_invoice_desc() connection error: %s", error)
            raise RSgeError("connection", str(error), raw=error) from error


def translate_rsge_error(env, error):
    """Turn an :class:`RSgeError` into a translated, user-facing message."""
    message_lambda = RSGE_ERROR_MESSAGES.get(
        error.kind,
        lambda detail: _lt("RS.ge error: %s", detail),
    )
    return env._(message_lambda(error.message or error.kind))
