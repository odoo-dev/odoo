import { Component, computed, props, proxy, t } from '@odoo/owl';
import { registry } from '@web/core/registry';
import { useBus } from '@web/core/utils/hooks';

export const deliveryAvailabilityProps = {
    showDeliveryAvailability: t.boolean(),
    uomName: t.string(),
    cartQuantity: t.number(),
    showAvailability: t.boolean(),
    availableThreshold: t.number(),
    quantityInStock: t.or([t.number(), t.literal(null)]),
};


export class DeliveryAvailability extends Component {
    static template = 'website_sale.DeliveryAvailability';
    props = props(deliveryAvailabilityProps);

    setup() {
        super.setup();
        this.state = proxy({
            showDeliveryAvailability: this.props.showDeliveryAvailability,
            uomName: this.props.uomName,
            cartQuantity: this.props.cartQuantity,
            quantityInStock: this.props.quantityInStock,
        });
        this.virtualInStock = computed(() => this._virtualQuantity(this.state.quantityInStock));
        this.showVirtualInStock = computed(() => this._showQuantity(this.virtualInStock));
        useBus(
            this.env.bus,
            'updateCombinationInfo',
            (ev) => this._updateStateWithCombinationInfo(ev.detail),
        );
    }

    _virtualQuantity(quantity) {
        return quantity && Math.max(quantity - this.state.cartQuantity, 0);
    }

    _showQuantity(quantitySignal) {
        return this.props.showAvailability && quantitySignal() <= this.props.availableThreshold;
    }

    /**
     * Update the state with the product combination info.
     *
     * @private
     * @param {Object} combinationInfo - The information on the current product variant.
     * @return {void}
     */
    _updateStateWithCombinationInfo(combinationInfo) {
        this.state.showDeliveryAvailability = combinationInfo.show_delivery_availability;
        this.state.uomName = combinationInfo.uom_name;
        this.state.cartQuantity = combinationInfo.cart_qty;
        this.state.quantityInStock = combinationInfo.quantity_in_stock;
    }
}

registry.category('public_components').add(
    'website_sale.DeliveryAvailability', DeliveryAvailability
);
