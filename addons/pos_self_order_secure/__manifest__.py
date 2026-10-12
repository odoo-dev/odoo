{
    "name": "POS Self Order – Session Timeout",
    "summary": "Limit self-order table sessions to a configured time duration.",
    "description": """
Self-Order Session Timeout for Mobile Self-Ordering.

Active ONLY when:
- Self-ordering mode = Mobile
- Pay after = Meal

Features:
- HMAC-signed table session token is issued when a customer scans the QR code.
- The session is valid for the configured timeout (e.g. 10 minutes).
- When time is up, the session expires and customers cannot order.
- Top banner prompts customers: "Your session has expired. Please scan the QR code again."
- Rescanning the table QR code starts a fresh session.
""",
    "category": "Sales/Point Of Sale",
    "version": "20.1.1.0.0",
    "depends": ["pos_self_order", "pos_restaurant"],
    "data": [
        "views/res_config_settings_views.xml",
    ],
    "assets": {
        "pos_self_order.assets": [
            "pos_self_order_secure/static/src/**/*",
        ],
    },
    "author": "Odoo Community",
    "license": "LGPL-3",
    "installable": True,
    "application": False,
    "auto_install": False,
}
