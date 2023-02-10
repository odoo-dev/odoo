# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "MRP Subcontracting",
    'version': '0.1',
    'summary': "Subcontract Productions",
    'website': 'https://www.odoo.com/app/manufacturing',
    'category': 'Manufacturing/Manufacturing',
    'depends': ['mrp'],
    'data': [
        'data/mrp_subcontracting_data.xml',
        'security/mrp_subcontracting_security.xml',
        'security/ir.model.access.csv',
        'views/mrp_bom_views.xml',
        'views/res_partner_views.xml',
        'views/stock_warehouse_views.xml',
        'views/stock_move_views.xml',
        'views/stock_quant_views.xml',
        'views/stock_picking_views.xml',
        'views/supplier_info_views.xml',
        'views/product_views.xml',
        'views/mrp_production_views.xml',
        'views/subcontracting_portal_views.xml',
        'views/subcontracting_portal_templates.xml',
        'views/stock_location_views.xml',
        'wizard/stock_picking_return_views.xml',
    ],
    'demo': [
        'data/mrp_subcontracting_demo.xml',
    ],
    'assets': {
        'web.assets_tests': [
            'mrp_subcontracting/static/tests/tours/subcontracting_portal_tour.js',
        ],
        'web.assets_backend': [
            'mrp_subcontracting/static/src/components/**/*',
        ],
        'mrp_subcontracting.webclient': [
            ('include', 'web._assets_helpers'),
            ('include', 'web._assets_backend_helpers'),

            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',

            ('include', 'web._assets_bootstrap'),

            'base/static/src/css/modules.css',

            'web/static/src/core/utils/transitions.scss',
            'web/static/src/core/**/*',
            'web/static/src/search/**/*',
            'web/static/src/views/*.js',
            'web/static/src/views/*.xml',
            'web/static/src/views/*.scss',
            'web/static/src/views/fields/**/*',
            'web/static/src/views/form/**/*',
            'web/static/src/views/kanban/**/*',
            'web/static/src/views/list/**/*',
            'web/static/src/views/view_button/**/*',
            'web/static/src/views/view_components/**/*',
            'web/static/src/views/view_dialogs/**/*',
            'web/static/src/views/widgets/**/*',
            'web/static/src/webclient/**/*',
            ('remove', 'web/static/src/webclient/navbar/navbar.scss'),  # already in assets_common
            ('remove', 'web/static/src/webclient/clickbot/clickbot.js'),  # lazy loaded
            ('remove', 'web/static/src/views/form/button_box/*.scss'),

            # remove the report code and whitelist only what's needed
            ('remove', 'web/static/src/webclient/actions/reports/**/*'),
            'web/static/src/webclient/actions/reports/*.js',
            'web/static/src/webclient/actions/reports/*.xml',

            'web/static/src/env.js',

            'web/static/lib/jquery.scrollTo/jquery.scrollTo.js',
            'web/static/lib/py.js/lib/py.js',
            'web/static/lib/py.js/lib/py_extras.js',
            'web/static/lib/jquery.ba-bbq/jquery.ba-bbq.js',

            'web/static/src/legacy/scss/fields.scss',
            'web/static/src/legacy/scss/views.scss',
            'web/static/src/legacy/scss/form_view.scss',
            'web/static/src/legacy/scss/list_view.scss',

            'base/static/src/scss/res_partner.scss',

            # Form style should be computed before
            'web/static/src/views/form/button_box/*.scss',

            'web/static/src/legacy/action_adapters.js',
            'web/static/src/legacy/legacy_service_provider.js',
            'web/static/src/legacy/legacy_client_actions.js',
            'web/static/src/legacy/legacy_dialog.js',
            'web/static/src/legacy/legacy_load_views.js',
            'web/static/src/legacy/legacy_promise_error_handler.js',
            'web/static/src/legacy/legacy_rpc_error_handler.js',
            'web/static/src/legacy/root_widget.js',
            'web/static/src/legacy/legacy_setup.js',
            'web/static/src/legacy/root_widget.js',
            'web/static/src/legacy/backend_utils.js',
            'web/static/src/legacy/utils.js',
            'web/static/src/legacy/web_client.js',
            'web/static/src/legacy/js/chrome/*',
            'web/static/src/legacy/js/components/*',
            'web/static/src/legacy/js/control_panel/*',
            'web/static/src/legacy/js/core/domain.js',
            'web/static/src/legacy/js/core/mvc.js',
            'web/static/src/legacy/js/core/py_utils.js',
            'web/static/src/legacy/js/core/context.js',
            'web/static/src/legacy/js/core/misc.js',
            'web/static/src/legacy/js/fields/abstract_field.js',
            'web/static/src/legacy/js/fields/basic_fields.js',
            'web/static/src/legacy/js/fields/field_utils.js',
            'web/static/src/legacy/js/fields/relational_fields.js',
            'web/static/src/legacy/js/fields/field_registry.js',
            'web/static/src/legacy/js/fields/field_utils.js',
            'web/static/src/legacy/js/services/data_manager.js',
            'web/static/src/legacy/js/services/session.js',
            'web/static/src/legacy/js/tools/tools.js',
            'web/static/src/legacy/js/widgets/date_picker.js',
            'web/static/src/legacy/js/widgets/domain_selector_dialog.js',
            'web/static/src/legacy/js/widgets/domain_selector.js',
            'web/static/src/legacy/js/widgets/model_field_selector.js',
            'web/static/src/legacy/js/widgets/model_field_selector_popover.js',
            'web/static/src/legacy/js/env.js',
            'web/static/src/legacy/js/owl_compatibility.js',
            'web/static/src/legacy/pseudo_web_client.js',

            'mrp_subcontracting/static/src/subcontracting_portal/*',
            'web/static/src/start.js',
            'web/static/src/legacy/legacy_setup.js',
        ],
    },
    'uninstall_hook': 'uninstall_hook',
    'license': 'LGPL-3',
}
