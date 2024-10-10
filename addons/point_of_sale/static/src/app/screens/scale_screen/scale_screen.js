/** @odoo-module */

<<<<<<< saas-17.2
import { roundPrecision as round_pr } from "@web/core/utils/numbers";
||||||| fd5123a8c79a0e3419fb8f81afb796d09a6fc30b
import { roundPrecision as round_pr } from "@web/core/utils/numbers";
import { registry } from "@web/core/registry";
=======
import { registry } from "@web/core/registry";
>>>>>>> c11e7f686276f99552d88d234cf17d68bc1f51b3
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component, onMounted, onWillUnmount, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";

export class ScaleScreen extends Component {
    static template = "point_of_sale.ScaleScreen";
    static components = { Dialog };
    static props = {
        getPayload: Function,
        product: Object,
        close: Function,
    };
    setup() {
        this.pos = usePos();
        this.hardwareProxy = useService("hardware_proxy");
        this.state = useState({ weight: 0 });
        onMounted(this.onMounted);
        onWillUnmount(this.onWillUnmount);
        this.pos = usePos();
    }
    onMounted() {
        // start the scale reading
        this._readScale();
    }
    onWillUnmount() {
        // stop the scale reading
        this.shouldRead = false;
    }
    confirm() {
        this.props.getPayload(this.state.weight);
        this.props.close();
    }
    _readScale() {
        this.shouldRead = true;
        this._setWeight();
    }
    async _setWeight() {
        if (!this.shouldRead) {
            return;
        }
        this.state.weight = await this.hardwareProxy.readScale();
        setTimeout(() => this._setWeight(), 500);
    }
    get _activePricelist() {
        const current_order = this.pos.get_order();
        let current_pricelist = this.pos.config.pricelist_id;
        if (current_order) {
            current_pricelist = current_order.pricelist;
        }
        return current_pricelist;
    }
    get productWeightString() {
<<<<<<< saas-17.2
        const defaultstr = (this.state.weight || 0).toFixed(3) + " Kg";
        if (!this.props.product) {
            return defaultstr;
        }
        const unit = this.props.product.uom_id;
        if (!unit) {
            return defaultstr;
        }
        const weight = round_pr(this.state.weight || 0, unit.rounding);
        let weightstr = weight.toFixed(Math.ceil(Math.log(1.0 / unit.rounding) / Math.log(10)));
        weightstr += " " + unit.name;
        return weightstr;
||||||| fd5123a8c79a0e3419fb8f81afb796d09a6fc30b
        const defaultstr = (this.state.weight || 0).toFixed(3) + " Kg";
        if (!this.props.product) {
            return defaultstr;
        }
        const unit_id = this.props.product.uom_id;
        if (!unit_id) {
            return defaultstr;
        }
        const unit = this.pos.units_by_id[unit_id[0]];
        const weight = round_pr(this.state.weight || 0, unit.rounding);
        let weightstr = weight.toFixed(Math.ceil(Math.log(1.0 / unit.rounding) / Math.log(10)));
        weightstr += " " + unit.name;
        return weightstr;
=======
        return (this.state.weight || 0).toFixed(3);
>>>>>>> c11e7f686276f99552d88d234cf17d68bc1f51b3
    }
    get computedPriceString() {
        return this.env.utils.formatCurrency(this.productPrice * this.state.weight);
    }
    get productPrice() {
        const product = this.props.product;
        return (product ? product.get_price(this._activePricelist, this.state.weight) : 0) || 0;
    }
    get productUom() {
        return this.props.product?.uom_id?.name;
    }
}
