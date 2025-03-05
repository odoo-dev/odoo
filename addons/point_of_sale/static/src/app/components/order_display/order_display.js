import { Component, useEffect, useRef, useExternalListener } from "@odoo/owl";
import { CenteredIcon } from "@point_of_sale/app/components/centered_icon/centered_icon";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";

// This methods is service-less, see PoS knowledges for more information
export class OrderDisplay extends Component {
    static template = "point_of_sale.OrderDisplay";
    static components = { CenteredIcon, Orderline };
    static props = {
        order: Object,
        slots: Object,
        mode: { type: String, optional: true }, // display, receipt
    };
    static defaultProps = {
        mode: "display",
    };

    setup() {
        this.scrollableRef = useRef("scrollable");
        useEffect(() => {
            this.scrollableRef.el
                ?.querySelector(".orderline.selected")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        useExternalListener(document, "keydown", this.handleKeydown.bind(this));
    }

    handleKeydown(event) {
        const selectedOrderline = document.querySelector(".orderline.selected");
        if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
            if (event.key === "ArrowUp") {
                selectedOrderline
                    ? selectedOrderline.previousElementSibling?.click()
                    : document.querySelector(".orderline:last-child")?.click();
            } else if (event.key === "ArrowDown") {
                selectedOrderline
                    ? selectedOrderline.nextElementSibling?.click()
                    : document.querySelector(".orderline:first-child")?.click();
            }
        }
    }
    formatCurrency(amount) {
        return formatCurrency(amount, this.order.currency.id);
    }

    emptyCartText() {
        return _t("Start adding products");
    }

    get order() {
        return this.props.order;
    }
}
