PT_CERTIFICATION_NUMBER = "9999"  # TODO: Fill with Certificate number provided by the Tax Authority

# Simplified invoice (FS) limits per Portuguese VAT code:
# goods <= 1000 EUR, services <= 100 EUR
PT_SIMPLIFIED_INVOICE_GOODS_LIMIT = 1000.0
PT_SIMPLIFIED_INVOICE_SERVICES_LIMIT = 100.0

# Mapping from Odoo document_type to AT webservice classeDoc / tipoDoc codes
# classeDoc: SI = Sales Invoice, PY = Payment, WD = Working Documents, MD = Movement Documents
# tipoDoc: FT = Invoice, FS = Simplified Invoice, FR = Invoice/Receipt,
#          NC = Credit Note, ND = Debit Note, RG = Payment Receipt,
#          OR = Quotation / Orçamento, NE = Sales Order / Nota de Encomenda,
#          GT = Transport Guide, GA = Internal Transport Guide, GD = Return Note
PT_AT_DOCUMENT_TYPE_MAPPING = {
    'out_invoice':         {'classeDoc': 'SI', 'tipoDoc': 'FT'},
    'out_receipt':         {'classeDoc': 'SI', 'tipoDoc': 'FS'},
    'out_invoice_receipt': {'classeDoc': 'SI', 'tipoDoc': 'FR'},
    'out_refund':          {'classeDoc': 'SI', 'tipoDoc': 'NC'},
    'debit_note':          {'classeDoc': 'SI', 'tipoDoc': 'ND'},
    'payment_receipt':     {'classeDoc': 'PY', 'tipoDoc': 'RG'},
    'quotation':           {'classeDoc': 'WD', 'tipoDoc': 'OR'},
    'sales_order':         {'classeDoc': 'WD', 'tipoDoc': 'NE'},
    'outgoing':            {'classeDoc': 'MD', 'tipoDoc': 'GT'},
    'internal':            {'classeDoc': 'MD', 'tipoDoc': 'GA'},
    'incoming':            {'classeDoc': 'MD', 'tipoDoc': 'GD'},
    'pos_order':           {'classeDoc': 'SI', 'tipoDoc': 'FS'},
    'pos_refund':          {'classeDoc': 'SI', 'tipoDoc': 'NC'},
}

# AT webservice meioProcessamento codes
PT_AT_MEIO_PROCESSAMENTO = 'PI'  # Programa Informático de Faturação

# AT webservice WSDL URL
PT_AT_WS_WSDL_URL = (
    'https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/'
    'Suporte_tecnologico/Webservice/Comunicacao_de_series_ATCUD/Documents/Comunicacao_Series.wsdl'
)

# AT webservice SOAP endpoints
PT_AT_WS_ENDPOINT_TEST = 'https://servicos.portaldasfinancas.gov.pt:722/SeriesWSService'
PT_AT_WS_ENDPOINT_PROD = 'https://servicos.portaldasfinancas.gov.pt:422/SeriesWSService'
