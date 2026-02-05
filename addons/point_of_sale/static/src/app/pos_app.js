import { reactive } from "@web/owl2/utils";
import { Transition } from "@web/core/transition";
import { MainComponentsContainer } from "@web/core/main_components_container";
import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
import { usePos, usePosRouter } from "@point_of_sale/app/hooks/pos_hook";
import { Component, onMounted } from "@odoo/owl";
import { useOwnDebugContext } from "@web/core/debug/debug_context";
import { useIdleTimer } from "./utils/use_idle_timer";
import useTours from "./hooks/use_tours";
import { init as initDebugFormatters } from "./utils/debug-formatter";
import { effect } from "@web/core/utils/reactive";
import { debounce } from "@web/core/utils/timing";
import { GeneratePrinterData } from "@point_of_sale/app/utils/generate_printer_data";
import { logPosMessage } from "@point_of_sale/app/utils/pretty_console_log";

const CONSOLE_COLOR = "#FF8269";

/**
 * Chrome is the root component of the PoS App.
 */
export class Chrome extends Component {
    static template = "point_of_sale.Chrome";
    static components = { Transition, MainComponentsContainer, Navbar };
    static props = { disableLoader: Function };
    setup() {
        this.pos = usePos();
        this.router = usePosRouter();
        this.data = { displayScreenSaver: false };
        this.channel = new BroadcastChannel("UPDATE_CUSTOMER_DISPLAY");
        useIdleTimer(this.pos.idleTimeout, (ev) => {
            const stopEventPropagation = ["mousedown", "click", "keypress"];
            if (stopEventPropagation.includes(ev.type)) {
                ev.stopPropagation();
            }
            this.pos.navigateToFirstPage();
            return false;
        });
        if (this.pos.router.state.current === "SaverScreen") {
            this.pos.navigateToFirstPage();
        }

        const reactivePos = reactive(this.pos);
        window.posmodel = reactivePos;
        useOwnDebugContext();
        if (this.env.debug) {
            initDebugFormatters();
        }

        if (odoo.use_pos_fake_tours) {
            window.pos_fake_tour = useTours();
        }

        if (this.pos.config.iface_big_scrollbars) {
            const body = document.getElementsByTagName("body")[0];
            body.classList.add("big-scrollbars");
        }

        onMounted(this.props.disableLoader);
        effect(
            debounce((pos, routerState) => {
                this.sendOrderToCustomerDisplay(pos, routerState);
            }),
            [this.pos, this.router.state]
        );
    }
    sendOrderToCustomerDisplay({ selectedOrder }, routerState) {
        if (selectedOrder) {
            const adapter = new GeneratePrinterData(selectedOrder, false);
            if (routerState.current === "SaverScreen" || routerState.current === "LoginScreen") {
                this.data.displayScreenSaver = true; // display screen saver
            } else if (selectedOrder) {
                this.data.displayScreenSaver = false; // disable screen saver
                this.data = { ...this.data, ...adapter.generateData() };
            }
        }
        this.channel.postMessage(JSON.parse(JSON.stringify(this.data)));
        this.pos.data
            .call("pos.config", "update_customer_display", [
                [this.pos.config.id],
                this.data,
                localStorage.getItem("device_uuid"),
            ])
            .catch((error) => {
                logPosMessage(
                    "CustomerDisplay",
                    "dispatch",
                    "Failed to update customer display",
                    CONSOLE_COLOR,
                    [error]
                );
            });
    }

    // GETTERS //
    get showCashMoveButton() {
        return Boolean(this.pos.config.cash_control);
    }
}
