import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { rpc } from "@web/core/network/rpc";

class SaleUpdateLineButton extends Interaction {
    static selector = ".o_portal_sale_sidebar";
    dynamicContent = {
        "a.js_update_line_json": {
            "t-on-click.prevent": (ev) => this.onClickOptionQuantityButton(ev.currentTarget),
        },
        "a.js_add_optional_products": {
            "t-on-click.prevent": (ev) => this.onClickAddOptionalProduct(ev.currentTarget),
        },
        ".js_quantity": {
            "t-on-change.prevent": (ev) => this.onChangeOptionQuantity(ev.currentTarget),
        },
    };

    setup() {
        this.orderDetail = this.el.querySelector('table#sales_order_table').dataset;
    }

    /**
     * Calls the route to get updated values of the line and order
     * when the quantity of a product has changed
     *
     * @param {integer} order_id
     * @param {Object} params
     * @return {Deferred}
     */
    callUpdateLineRoute(order_id, params) {
        return rpc("/my/orders/" + order_id + "/update_line_dict", params);
    }

    refreshOrderUI() {
        window.location.reload();
    }

    async onChangeOptionQuantity(targetEl) {
        const quantity = parseInt(targetEl.value);
        await this.waitFor(this.callUpdateLineRoute(this.orderDetail.orderId, {
            'access_token': this.orderDetail.token,
            'line_id': targetEl.dataset.lineId,
            'input_quantity': quantity >= 0 ? quantity : false,
        }));
        this.refreshOrderUI();
    }

    async onClickOptionQuantityButton(targetEl) {
        await this.waitFor(this.callUpdateLineRoute(this.orderDetail.orderId, {
            'access_token': this.orderDetail.token,
            'line_id': targetEl.dataset.lineId,
            'remove': targetEl.dataset.remove,
            'unlink': targetEl.dataset.unlink,
        }));
        this.refreshOrderUI();
    }

    async onClickAddOptionalProduct(targetEl) {
        // to avoid double click on link with href.
        targetEl.style.setProperty('pointer-events', 'none');

        await this.waitFor(rpc("/my/orders/" + this.orderDetail.orderId + "/add_option/" + $target.data('optionId'), {
            'access_token': this.orderDetail.token,
        }));
        this.refreshOrderUI(data);
    }
}

registry
    .category("public.interactions")
    .add("sale_management.sale_update_line_button", SaleUpdateLineButton);
