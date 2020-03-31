odoo.define('point_of_sale.HomeCategoryBreadcrumb', function(require) {
    'use strict';

    const { PosComponent, addComponents } = require('point_of_sale.PosComponent');
    const { ProductsWidgetControlPanel } = require('point_of_sale.ProductsWidgetControlPanel');
    const Registry = require('point_of_sale.ComponentsRegistry');

    class HomeCategoryBreadcrumb extends PosComponent {
        static template = 'HomeCategoryBreadcrumb';
    }

    addComponents(ProductsWidgetControlPanel, [HomeCategoryBreadcrumb]);
    Registry.add('HomeCategoryBreadcrumb', HomeCategoryBreadcrumb);

    return { HomeCategoryBreadcrumb };
});
