# Part of Odoo. See LICENSE file for full copyright and licensing details.

# HDFC UPI QR Payment Provider Constants

# Base URLs for HDFC UPI API endpoints
HDFC_UPI_API_URLS = {
    'test': 'https://upitestv2.hdfcbank.com/upi',
    'production': 'https://upiv2.hdfcbank.com/upi',
}

# API endpoints mapping
API_ENDPOINTS = {
    'status': '/transactionStatusQuery',
    'refund': '/refundReqSvc',
}

# HDFC UPI API Field Specifications
# All three APIs use pipe-separated format with specific field structures

# Transaction Status Enquiry API - Request Fields (14 fields)
STATUS_ENQUIRY_REQUEST_FIELDS = [
    'pgMerchantId',        # Field 1: PG Merchant ID (16-digit)
    'orderNo',             # Field 2: Order Number (Conditional)
    'upiTxnId',           # Field 3: UPI Transaction ID (Optional)
    'rrn',                # Field 4: Request Reference Number (Conditional)
    'additionalField1',   # Field 5: Additional Field 1
    'additionalField2',   # Field 6: Additional Field 2
    'additionalField3',   # Field 7: Additional Field 3
    'additionalField4',   # Field 8: Additional Field 4
    'additionalField5',   # Field 9: Additional Field 5
    'additionalField6',   # Field 10: Additional Field 6
    'additionalField7',   # Field 11: Additional Field 7
    'additionalField8',   # Field 12: Additional Field 8
    'additionalField9',   # Field 13: Additional Field 9 (Expected: NA)
    'additionalField10',  # Field 14: Additional Field 10 (Expected: NA)
]

# Common Response Fields for All APIs (21 fields)
RESPONSE_FIELDS = [
    'upiTxnId',           # Field 1: UPI Transaction ID
    'orderNo',            # Field 2: Order Number
    'amount',             # Field 3: Amount
    'txnAuthDate',        # Field 4: Transaction Auth Date
    'status',             # Field 5: Status
    'statusDesc',         # Field 6: Status Description
    'responseCode',       # Field 7: Response Code
    'approvalNumber',     # Field 8: Approval Number
    'payerVPA',           # Field 9: Payer Virtual Address
    'customerRefNo',      # Field 10: Customer Reference Number (RRN)
    'referenceId',        # Field 11: Reference ID
    'additionalField1',   # Field 12: Additional Field 1
    'additionalField2',   # Field 13: Additional Field 2
    'additionalField3',   # Field 14: Additional Field 3
    'additionalField4',   # Field 15: Additional Field 4
    'additionalField5',   # Field 16: Additional Field 5
    'additionalField6',   # Field 17: Payer Details (Bank!Account!IFSC!Mobile)
    'additionalField7',   # Field 18: Transaction Details (Type!RefUrl!NA!TxnId!NA)
    'additionalField8',   # Field 19: Payee VPA Details (VPA!NA!NA)
    'additionalField9',   # Field 20: Payer Account Type (Type!NA!NA!NA!NA)
    'additionalField10',  # Field 21: Payer Name (Name!NA!NA!NA!NA)
]

# Error codes for Transaction Status Enquiry API
STATUS_ENQUIRY_ERROR_CODES = {
    '3': 'Merchant not found or inactive',
    '4': 'Validation error - Invalid request parameters',
    '1': 'Transaction not found or failed',
    '1000': 'Technical error occurred',
}

# Refund API - Request Fields (20 fields)
REFUND_REQUEST_FIELDS = [
    'pgMerchantId',        # Field 1: PG Merchant ID (16-digit)
    'newOrderNo',          # Field 2: New Order Number for refund
    'originalOrderNo',     # Field 3: Original Order Number
    'originalTrnRefNo',    # Field 4: Original Transaction Reference Number (UPI Txn ID)
    'originalCustRefNo',   # Field 5: Original Customer Reference Number (RRN)
    'remarks',             # Field 6: Refund remarks/description
    'refundAmount',        # Field 7: Refund amount
    'currency',            # Field 8: Currency (INR)
    'paymentType',         # Field 9: Payment Type (P2P)
    'transactionType',     # Field 10: Transaction Type (PAY)
    'additionalField1',    # Field 11: Additional Field 1
    'additionalField2',    # Field 12: Additional Field 2
    'additionalField3',    # Field 13: Additional Field 3
    'additionalField4',    # Field 14: Additional Field 4
    'additionalField5',    # Field 15: Additional Field 5
    'additionalField6',    # Field 16: Additional Field 6
    'additionalField7',    # Field 17: Additional Field 7
    'additionalField8',    # Field 18: Additional Field 8
    'additionalField9',    # Field 19: Additional Field 9 (Expected: NA)
    'additionalField10',   # Field 20: Additional Field 10 (Expected: NA)
]

# Error codes for Refund API
REFUND_ERROR_CODES = {
    'V101': 'Invalid Merchant ID',
    'V103': 'Invalid Transaction Request',
    'V104': 'Invalid Order ID',
    'V105': 'Invalid Order ID Length',
    'V106': 'Invalid Original Order Number',
    'V107': 'Duplicate Order Number',
    'V108': 'Invalid Original Reference Number',
    'V109': 'Invalid Original Customer Reference Number',
    'V110': 'Invalid Transaction Remark',
    'V111': 'Invalid Transaction Amount',
    'V112': 'Invalid Transaction Currency Code',
    'V113': 'Invalid Transaction Payment Type',
    'V114': 'Invalid Transaction Type',
    'V115': 'Invalid Additional Field',
    'V116': 'Refund Already Processed',
    'V117': 'Refund Amount Exceeds The Original Amount',
    'V118': 'Refund Already in Progress',
    'V119': 'Refund Request Rejected',
    'V121': 'Invalid OrderNo/RRN/PgMerchantId',
    'E01': 'Technical Error Occurred',
    'V135': 'Refund failed due to hold',
    'XH': 'Account does not exist (remitter)',
    '1': 'Invalid merchant ID',
    '4': 'Invalid merchant ID',
    '70': 'Refund transaction failed',
    '50': 'Refund transaction request initiated',
    '2226': 'Refund status accepted',
}

# Supported currencies - UPI only supports INR
SUPPORTED_CURRENCIES = ['INR']

# Default payment method codes for HDFC UPI
DEFAULT_PAYMENT_METHOD_CODES = {'upi_qr'}

# UPI transaction limits (in INR)
TRANSACTION_LIMITS = {
    'min_amount': 1.00,
    'max_amount': 100000.00,
}

# QR code configuration
QR_CODE_CONFIG = {
    'expiry_minutes': 5,
    'width': 300,
    'height': 300,
    'version': '01',
    'mode': '15',
    'medium': '06',
}

# Payment status mapping for HDFC UPI responses
PAYMENT_STATUS_MAPPING = {
    'pending': ('PENDING'),
    'done': ('SUCCESS', 'S', 'Success'),
    'cancel': ('FAILED', 'Failed', 'FAILURE', 'REJECTED', 'EXPIRED'),
    'error': ('ERROR', 'UNKNOWN', 'MC04'),
}

# UPI URL parameters template
UPI_URL_TEMPLATE = (
    "upi://pay?ver={version}&mode={mode}"
    "&tr={transaction_ref}&tn={transaction_note}"
    "&pn={payee_name}&pa={payee_vpa}"
    "&mc={merchant_category}&am={amount}"
    "&cu={currency}&qrMedium={medium}"
    "&QRexpire={expiry_time}"
)

# Validation patterns
VALIDATION_PATTERNS = {
    'upi_vpa': r'^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$',
    'order_number': r'^PQ\d+\d{13}$',
    'refund_number': r'^RF\w+\d{10}$',
}

# Refund configuration
REFUND_CONFIG = {
    'time_limit_days': 180,  # 6 months refund window (need to confirm with HDFC)
}
