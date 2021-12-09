/** @odoo-module alias=web.clickEverywhere **/

import { registry } from "../../core/registry";

const { loadFile } = owl;

export default async function startClickEverywhere(xmlId, appsMenusOnly) {
    await loadFile("web/static/src/webclient/clickbot/clickbot.js"); // FIXME NXOWL
    window.clickEverywhere(xmlId, appsMenusOnly);
}

function runClickTestItem({ env }) {
    return {
        type: "item",
        description: env._t("Run Click Everywhere Test"),
        callback: () => {
            startClickEverywhere();
        },
        sequence: 30,
    };
}

registry.category("debug").category("default").add("runClickTestItem", runClickTestItem);
