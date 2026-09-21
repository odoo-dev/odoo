# Part of Odoo. See LICENSE file for full copyright and licensing details.

# See "Environment Routes" in the Kueski Pay API Enterprise spec.
PRODUCTION_API_URL = "https://api.kueskipay.com"
TEST_API_URL = "https://testing.kueskipay.com"

SUPPORTED_CURRENCY = "MXN"

CAPTURE_METHOD = "automatic"

# The codes of the default primary payment methods to activate
DEFAULT_PAYMENT_METHOD_CODES = {"kueski"}

# Mapping of transaction states to the statuses of Kueski's "Payment Intent Model".
PAYMENT_STATUS_MAPPING = {
    "pending": ("created", "processing"),
    "done": ("authorized", "success"),  # Automatic capture, no capture call.
    "cancel": ("canceled",),
    "error": ("declined",),
}
