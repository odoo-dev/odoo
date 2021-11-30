/** @odoo-module */

import { useService } from "@web/core/utils/hooks";

import Chrome from "point_of_sale.Chrome";
import Registries from "point_of_sale.Registries";
import { reactive } from "@point_of_sale/js/reactivity";
import { PosGlobalState } from "point_of_sale.models";
import { configureGui } from "point_of_sale.Gui";
import { useBus } from "@web/core/utils/hooks";
const { Component } = owl;
import { registry } from "@web/core/registry";
import { proxy_queue, proxy, barcode_reader } from "@point_of_sale/js/pos_env";

function setupResponsivePlugin(env) {
    const isMobile = () => window.innerWidth <= 768;
    env.isMobile = isMobile();
    const updateEnv = owl.utils.debounce(() => {
        if (env.isMobile !== isMobile()) {
            env.isMobile = !env.isMobile;
            env.qweb.forceUpdate();
        }
    }, 15);
    window.addEventListener("resize", updateEnv);
}

export class ChromeAdapter extends Component {
    setup() {
        this.PosChrome = Registries.Component.get(Chrome);
        this.legacyActionManager = useService("legacy_action_manager");

        const ExtendedPosGlobalState = Registries.PosModelRegistry.get(PosGlobalState);
        const pos = new ExtendedPosGlobalState();
        const reactivePos = reactive(pos, () => {});
        proxy.set_pos(reactivePos);

        window.posmodel = reactivePos;

        this.env = owl.Component.env;
        this.env.pos = reactivePos;
        this.env.proxy_queue = proxy_queue;
        this.env.proxy = proxy;
        this.env.barcode_reader = barcode_reader;

        useBus(this.env.qweb, "update", () => this.render());
        setupResponsivePlugin(this.env);

        const chrome = owl.hooks.useRef("chrome");
        owl.hooks.onMounted(async () => {
            // Add the pos error handler when the chrome component is available.
            registry.category('error_handlers').add(
                'posErrorHandler',
                (env, ...noEnvArgs) => {
                    if (chrome.comp) {
                        return chrome.comp.errorHandler(this.env, ...noEnvArgs);
                    }
                    return false;
                },
                { sequence: 0 }
            );
            // Little trick to avoid displaying the block ui during the POS models loading
            const BlockUiFromRegistry = registry.category("main_components").get("BlockUI");
            registry.category("main_components").remove("BlockUI");
            configureGui({ component: chrome.comp });
            await chrome.comp.start();
            registry.category("main_components").add("BlockUI", BlockUiFromRegistry);
        });
    }
}
ChromeAdapter.template = owl.tags.xml`<PosChrome t-ref="chrome" webClient="legacyActionManager"/>`;
