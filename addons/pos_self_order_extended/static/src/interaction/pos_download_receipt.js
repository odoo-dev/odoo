import { OrderReceipt } from "./order_receipt/order_receipt";
import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";

export class ReceiptDownloadInteraction extends Interaction {
    static selector = ".download-pos-receipt";

    setup() {
        super.setup(...arguments);
    }

    dynamicContent = {
        _root: {
            "t-on-click": (ev) => this.onClick(ev),
        },
    };

    async onClick(ev) {
        ev.preventDefault();
        const order = JSON.parse(this.el.dataset.orderobj);
        try {
            const link = document.createElement("a");
            link.download = `${order.pos_reference}.png`;
            const png = await this.env.services.renderer.toCanvas(
                OrderReceipt,
                {
                    order: order,
                    basic_receipt: true,
                },
                {}
            );
            link.href = png.toDataURL().replace("data:image/jpeg;base64,", "");
            link.click();
        } catch (err) {
            console.error("Error during receipt download:", err);
        }
    }
}

registry
    .category("public.interactions")
    .add("pos_self_order_extended.receipt_download", ReceiptDownloadInteraction);
