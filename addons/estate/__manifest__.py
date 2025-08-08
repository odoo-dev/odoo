# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    "name": "estate",
    "version": "1.0",
    "summary": "real estate",
    "depends": [
        "base_setup",
    ],
    "data": [
        "security/ir.model.access.csv",
        "views/estate_property_offer_views.xml",
        "views/estate_property_tag_views.xml",
        "views/estate_property_type_views.xml",
        "views/estate_property_views.xml",
        "views/estate_menus.xml",
        "views/res_users_view.xml",
    ],
    "license": "LGPL-3",
}
