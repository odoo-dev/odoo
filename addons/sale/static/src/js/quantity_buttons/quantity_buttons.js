
import { Component } from '@odoo/owl';

export class QuantityButtons extends Component {
    static template = 'sale.QuantityButtons';
    static props = {
        quantity: Number,
        uom_id: { type: Number, optional: true },
        uom_data: { type: Object, optional: true },
        setQuantity: Function,
        isMinusButtonDisabled: { type: Boolean, optional: true },
        isPlusButtonDisabled: { type: Boolean, optional: true },
        btnClasses: { type: String, optional: true },
    };

    /**
     * Increase the quantity.
     */
    increaseQuantity() {
        this.props.setQuantity(this.props.quantity + 1, this.props.uom_id);
    }

    /**
     * Decrease the quantity.
     */
    decreaseQuantity() {
        this.props.setQuantity(this.props.quantity - 1, this.props.uom_id);
    }

    onChangeUoM(ev) {
        this.props.setQuantity(this.props.quantity, parseInt(ev.currentTarget.value));
    }

    /**
     * Set the quantity to a specified value.
     *
     * @param {Event} event The quantity input's `on change` event, containing the new quantity.
     */
    async setQuantity(event) {
        const quantity = parseFloat(event.target.value);
        const didUpdateQuantity = await this.props.setQuantity(isNaN(quantity) ? 0 : quantity);
        // If the quantity wasn't updated, the component won't rerender, and the input will display
        // a stale value. As a result, we need to manually rerender the input.
        if (!didUpdateQuantity) {
            this.render();
        }
    }
}
