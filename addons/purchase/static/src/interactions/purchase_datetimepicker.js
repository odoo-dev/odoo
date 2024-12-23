import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { rpc } from "@web/core/network/rpc";

export class PurchaseDatetimePicker extends Interaction {
    static selector = ".o-purchase-datetimepicker";

    start() {
        this.disableDateTimePicker = this.call("datetime_picker", "create", {
            target: this.el,
            onChange: (newDate) => {
                const accessToken = this.el.dataset.accessToken;
                const orderId = this.el.dataset.orderId;
                const lineId = this.el.dataset.lineId;
                this.waitFor(rpc(`/my/purchase/${orderId}/update?access_token=${accessToken}`, {
                    [lineId]: newDate.toISODate(),
                }));
            },
            pickerProps: {
                type: "date",
                value: luxon.DateTime.fromISO(this.el.dataset.value),
            },
        }).enable();
    }

    destroy() {
        this.disableDateTimePicker();
    }
}

registry
    .category("public.interactions")
    .add("purchase.purchase_datetime_picker", PurchaseDatetimePicker);
