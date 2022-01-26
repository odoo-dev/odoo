/** @odoo-module */

import { useService } from "@web/core/utils/hooks";

import Chrome from "point_of_sale.Chrome";
import Registries from "point_of_sale.Registries";
import { configureGui } from "point_of_sale.Gui";
import { useBus } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";
import { debounce } from "@web/core/utils/timing";

const { Component, useSubEnv, xml } = owl;

function setupResponsivePlugin(env) {
    const isMobile = () => window.innerWidth <= 768;
    env.isMobile = isMobile();
    const updateEnv = debounce(() => {
        if (env.isMobile !== isMobile()) {
            env.isMobile = !env.isMobile;
            env.qweb.forceUpdate(); // NXOWL no more qweb accessible in env
        }
    }, 15);
    window.addEventListener("resize", updateEnv);
}

export class ChromeAdapter extends Component {
    setup() {
        this.PosChrome = Registries.Component.get(Chrome);
        this.legacyActionManager = useService("legacy_action_manager");

        this.env = Component.env;
        useSubEnv(this.env);
        // useBus(this.env.qweb, "update", () => this.render()); // NXOWL ?
        setupResponsivePlugin(this.env);
    }

    async configureAndStart(chrome) {
        // Add the pos error handler when the chrome component is available.
        registry.category('error_handlers').add(
            'posErrorHandler',
            (env, ...noEnvArgs) => {
                if (chrome) {
                    return chrome.errorHandler(this.env, ...noEnvArgs);
                }
                return false;
            },
            { sequence: 0 }
        );
        // Little trick to avoid displaying the block ui during the POS models loading
        const BlockUiFromRegistry = registry.category("main_components").get("BlockUI");
        registry.category("main_components").remove("BlockUI");
        configureGui({ component: chrome });
        await chrome.start();
        registry.category("main_components").add("BlockUI", BlockUiFromRegistry);
    }
}
ChromeAdapter.template = xml`<t t-component="PosChrome" setupIsDone="configureAndStart" webClient="legacyActionManager"/>`;
