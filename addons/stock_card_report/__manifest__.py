# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    "name": "Stock Card Report",
    "summary": "Stock ledger of every product, with running quantities and valuation",
    "description": """
Stock Card Report
=================
A stock card (stock ledger) listing every done stock move line of a product with its
starting quantity, quantity in and out, ending quantity and the matching valuation.

The balances are tracked backward from the current stock and valuation, so only the
moves of the chosen period are needed to display it.
    """,
    "category": "Inventory/Inventory",
    "author": "Odoo S.A.",
    "license": "OEEL-1",
    "depends": [
        "stock_account",
    ],
    "data": [
        "security/ir.access.csv",
        "wizard/stock_card_wizard_views.xml",
        "report/stock_card_report_views.xml",
    ],
}
