odoo.define('point_of_sale.ProductDisplay', function(require) {
    'use strict';

    const { PosComponent, addComponents } = require('point_of_sale.PosComponent');
    const { ProductsList } = require('point_of_sale.ProductsList');
    const Registry = require('point_of_sale.ComponentsRegistry');

    class ProductDisplay extends PosComponent {
        static template = 'ProductDisplay';
        /**
         * For accessibility, pressing <space> should be like clicking the product.
         * <enter> is not considered because it conflicts with the barcode.
         *
         * @param {KeyPressEvent} event
         */
        spaceClickProduct(event) {
            if (event.which === 32) {
                this.trigger('click-product', this.props.product);
            }
        }
        get imageUrl() {
            return `${window.location.origin}/web/image?model=product.product&field=image_128&id=${this.props.product.id}`;
        }
        get pricelist() {
            const current_order = this.env.pos.get_order();
            if (current_order) {
                return current_order.pricelist;
            }
            return this.env.pos.default_pricelist;
        }
        get price() {
            const formattedUnitPrice = this.env.pos.format_currency(
                this.props.product.get_price(this.pricelist, 1),
                'Product Price'
            );
            if (this.props.product.to_weight) {
                return `${formattedUnitPrice}/${
                    this.env.pos.units_by_id[this.props.product.uom_id[0]].name
                }`;
            } else {
                return formattedUnitPrice;
            }
        }
    }

    addComponents(ProductsList, [ProductDisplay]);
    Registry.add('ProductDisplay', ProductDisplay);

    return { ProductDisplay };
});
