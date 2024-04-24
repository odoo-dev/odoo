import { _t } from "@web/core/l10n/translation";
import { browser } from "@web/core/browser/browser";
import { EventBus, Component, useState, xml, useRef, onWillDestroy } from "@odoo/owl";
import LoadingScreen from "@web/core/ui/loading_screen";


export class BlockUI extends Component {
    static props = {
        bus: EventBus,
    };

    static template = xml`
        <div t-att-class="state.blockUI ? 'o_blockUI fixed-top d-flex justify-content-center align-items-center flex-column vh-100' : ''">
          <t t-if="state.blockUI">
            <div class="loading-screen-ux" t-ref="loading-screen"/>
            <div class="o_message text-center px-4">
                <t t-esc="state.line1"/> <br/>
                <t t-esc="state.line2"/>
            </div>
          </t>
        </div>`;

    setup() {
        this.messagesByDuration = [
            { time: 20, l1: _t("Loading...") },
            { time: 40, l1: _t("Still loading...") },
            {
                time: 60,
                l1: _t("Still loading..."),
                l2: _t("Please be patient."),
            },
            {
                time: 180,
                l1: _t("Don't leave yet,"),
                l2: _t("it's still loading..."),
            },
            {
                time: 120,
                l1: _t("You may not believe it,"),
                l2: _t("but the application is actually loading..."),
            },
            {
                time: 3180,
                l1: _t("Take a minute to get a coffee,"),
                l2: _t("because it's loading..."),
            },
            {
                time: null,
                l1: _t("Maybe you should consider reloading the application by pressing F5..."),
            },
        ];
        this.state = useState({
            blockUI: false,
            line1: "",
            line2: "",
        });

        this.props.bus.addEventListener("BLOCK", this.block.bind(this));
        this.props.bus.addEventListener("UNBLOCK", this.unblock.bind(this));

        this.loadingUX = new LoadingScreen();
        this.loading = useRef("loading-screen");
        onWillDestroy(() => this.loadingUX.stop());
    }

    replaceMessage(index) {
        const message = this.messagesByDuration[index];
        this.state.line1 = message.l1;
        this.state.line2 = message.l2 || "";
        if (message.time !== null) {
            this.msgTimer = browser.setTimeout(() => {
                this.replaceMessage(index + 1);
            }, message.time * 1000);
        }
    }

    block(ev) {
        this.state.blockUI = true;
        if (ev.detail?.message) {
            this.state.line1 = ev.detail.message;
        } else {
            this.replaceMessage(0);
        }
        // this timeout is needed in order to wait for the component to
        // arrive in it's final state.
        this.loadingTimer = browser.setTimeout(() => {
            // In few tests "browser.setTimeout" is updated to be
            // synchronous, the component is not ready.
            if (this.loading.el) {
                this.loading.el.append(this.loadingUX.render());
                this.loadingUX.start();
            }
        }, 100);
    }

    unblock() {
        this.state.blockUI = false;
        clearTimeout(this.msgTimer);
        clearTimeout(this.loadingTimer);
        this.loadingUX.stop();
        this.state.line1 = "";
        this.state.line2 = "";
    }
}
