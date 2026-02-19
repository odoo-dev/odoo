/** @odoo-module */

import { Component, proxy, xml } from "@odoo/owl";
import { createUrl, refresh } from "../core/url";
import { callHootKey, useHootKey, useWindowListener } from "../hoot_utils";
import { HootButtons } from "./hoot_buttons";
import { HootConfigMenu } from "./hoot_config_menu";
import { HootDebugToolBar } from "./hoot_debug_toolbar";
import { HootDropdown } from "./hoot_dropdown";
import { HootReporting } from "./hoot_reporting";
import { HootSearch } from "./hoot_search";
import { HootSideBar } from "./hoot_side_bar";
import { HootStatusPanel } from "./hoot_status_panel";

//-----------------------------------------------------------------------------
// Global
//-----------------------------------------------------------------------------

const { setTimeout } = globalThis;

//-----------------------------------------------------------------------------
// Internal
//-----------------------------------------------------------------------------

// Indenpendant from Hoot style classes since it is not loaded in headless
const HEADLESS_CONTAINER_STYLE = [
    "position: absolute",
    "bottom: 0",
    "inset-inline-start: 50%",
    "transform: translateX(-50%)",
    "display: flex",
    "z-index: 4",
    "margin-bottom: 1rem",
    "padding-left: 1rem",
    "padding-right: 1rem",
    "padding-top: 0.5rem",
    "padding-bottom: 0.5rem",
    "gap: 0.5rem",
    "white-space: nowrap",
    "border-radius: 9999px",
    "box-shadow: 2px 1px 5px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
    "background-color: #e2e8f0",
].join(";");
const HEADLESS_LINK_STYLE = ["color: #714b67", "text-decoration: underline"].join(";");

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

export class HootMain extends Component {
    static components = {
        HootButtons,
        HootConfigMenu,
        HootDebugToolBar,
        HootDropdown,
        HootReporting,
        HootSearch,
        HootSideBar,
        HootStatusPanel,
    };
    static template = xml`
        <t t-if="this.env.runner.headless">
            <div style="${HEADLESS_CONTAINER_STYLE}">
                Running in headless mode
                <a style="${HEADLESS_LINK_STYLE}" t-att-href="this.createUrl({ headless: null })">
                    Run with UI
                </a>
            </div>
        </t>
        <t t-else="">
            <main
                class="${HootMain.name} flex flex-col w-full h-full bg-base relative"
                t-att-class="{ 'hoot-animations': this.env.runner.config.fun }"
            >
                <header class="flex flex-col bg-gray-200 dark:bg-gray-800">
                    <nav class="hoot-controls py-1 px-2">
                        <h1
                            class="hoot-logo m-0 select-none"
                            title="Hierarchically Organized Odoo Tests"
                        >
                            <strong class="flex">HOOT</strong>
                        </h1>
                        <HootButtons />
                        <HootSearch />
                        <HootDropdown buttonClassName="'bg-btn'">
                            <t t-set-slot="toggler" t-slot-scope="dropdownState">
                                <i class="fa fa-cog transition" t-att-class="{ 'rotate-90': dropdownState.open }" />
                            </t>
                            <t t-set-slot="menu">
                                <HootConfigMenu />
                            </t>
                        </HootDropdown>
                    </nav>
                </header>
                <HootStatusPanel />
                <div class="flex h-full overflow-y-auto">
                    <HootSideBar />
                    <HootReporting />
                </div>
            </main>
            <t t-if="this.state.debugTest">
                <HootDebugToolBar test="this.state.debugTest" />
            </t>
        </t>
    `;

    state = proxy({
        debugTest: null,
    });

    createUrl = createUrl;
    escapeKeyPresses = 0;

    setup() {
        this.env.runner.beforeAll(() => {
            if (!this.env.runner.debug) {
                return;
            }
            if (this.env.runner.debug === true) {
                this.state.debugTest = this.env.runner.state.tests[0];
            } else {
                this.state.debugTest = this.env.runner.debug;
            }
        });
        this.env.runner.afterAll(() => {
            this.state.debugTest = null;
        });

        useWindowListener("resize", (ev) => this.onWindowResize(ev));
        useWindowListener("keydown", callHootKey, { capture: true });
        useHootKey(["Enter"], this.manualStart.bind(this));
        useHootKey(["Escape"], this.abort.bind(this));

        if (!this.env.runner.config.headless) {
            useHootKey(["Alt", "d"], this.toggleDebug.bind(this));
        }
    }

    /**
     * @param {KeyboardEvent} ev
     */
    abort(ev) {
        this.escapeKeyPresses++;
        setTimeout(() => this.escapeKeyPresses--, 500);

        if (this.env.runner.state.status === "running" && this.escapeKeyPresses >= 2) {
            ev.preventDefault();
            this.env.runner.stop();
        }
    }

    /**
     * @param {KeyboardEvent} ev
     */
    manualStart(ev) {
        if (this.env.runner.state.status !== "ready") {
            return;
        }

        ev.preventDefault();

        if (this.env.runner.config.manual) {
            this.env.runner.manualStart();
        } else {
            refresh();
        }
    }

    onWindowResize() {
        this.env.runner.checkPresetForViewPort();
    }

    /**
     * @param {KeyboardEvent} ev
     */
    toggleDebug(ev) {
        ev.preventDefault();

        this.env.runner.config.debugTest = !this.env.runner.config.debugTest;
    }
}
