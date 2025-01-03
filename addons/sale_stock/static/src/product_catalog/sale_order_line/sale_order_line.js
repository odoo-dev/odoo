import { _t } from "@web/core/l10n/translation";
import { ProductCatalogSaleOrder } from "@sale/product_catalog/sale_order_line/sale_order_line";

export class ProductCatalogSaleOrderLine extends ProductCatalogSaleOrder {
    static template = "sale_stock.ProductCatalogSaleOrderLineStock"
    static props = {
        ...ProductCatalogSaleOrder.props,
        deliveredQty: Number,
        is_storable: { type: Boolean, optional: true },
        virtual_available: { type: Number, optional: true },
        qty_available: { type: Number, optional: true },
    }

    get disableRemove() {
        return this.props.quantity === this.props.deliveredQty;
    }

    get disabledButtonTooltip() {
        if (this.disableRemove) {
            return _t("The ordered quantity cannot be decreased below the amount already delivered. Instead, create a return in your inventory.");
        }
        return super.disabledButtonTooltip;
    }

    get forcasted_qty() {
            if (this.props.productType == 'consu' && this.props.is_storable) {
            return this.props.virtual_available - this.props.qty_available;
        }
        return 0;
    }
}
