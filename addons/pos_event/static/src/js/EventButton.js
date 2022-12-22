/** @odoo-module */

import PosComponent from "@point_of_sale/js/PosComponent";
import ProductScreen from "@point_of_sale/js/Screens/ProductScreen/ProductScreen";
import Registries from "@point_of_sale/js/Registries";
import { identifyError } from "@point_of_sale/js/utils";
import { ConnectionLostError, ConnectionAbortedError } from "@web/core/network/rpc_service";
import { useListener } from "@web/core/utils/hooks";


export class EventButton extends PosComponent {
    setup() {
        super.setup();
        useListener("click", this.onClick);
    }
    async onClick() {
        try {
            const eventData = await this.rpc({
                model: "event.event.ticket",
                method: "get_ticket_linked_to_product_available_pos",
            });
            const { confirmed, payload } = await this.showPopup("EventConfiguratorPopup", { eventData });
            if (confirmed) {
                const { ticketDetails } = payload;
                const currentOrder = this.env.pos.get_order();
                for (const ticketDetail of ticketDetails) {
                    const options = {
                        quantity: ticketDetail["quantity"],
                        customer_note: ticketDetail["name"],
                        ticketId: ticketDetail["id"],
                        eventId: ticketDetail["eventId"],
                    };
                    currentOrder.add_product(ticketDetail["product"], options);
                }
            }
        } catch (e) {
            const error = identifyError(e);
            if (error instanceof ConnectionLostError || error instanceof ConnectionAbortedError) {
                await this.showPopup("ErrorPopup", {
                    title: this.env._t("Network Error"),
                    body: this.env._t("Cannot load Events and Tickets"),
                });
            } else {
                await this.showPopup("ErrorPopup", {
                    title: this.env._t("Unknown error"),
                    body: this.env._t("Cannot load Events and Tickets due to an unknown error."),
                });
            }
        }
    }
}
EventButton.template = "EventButton";

ProductScreen.addControlButton({
    component: EventButton,
});

Registries.Component.add(EventButton);
