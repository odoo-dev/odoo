/** @ts-check */

import { OdooCorePlugin } from "@spreadsheet/plugins";
import { registries, coreTypes } from "@odoo/o-spreadsheet";

const DEFAULT_CONTENT = `
<div data-name="Dashboard" class="oe_unremovable oe_unmovable h-100"">
    <div class="oe_unremovable">
        <div class="row mw-100 mx-0">
        <div class="col o_mail_no_options o_mail_wrapper_td oe_structure o_savable oe_empty o_dirty" data-editor-message-default="true" data-editor-message="Drag blocks here" contenteditable="true">
            </div></div></div></div>`;

export class DashboardContentPlugin extends OdooCorePlugin {
    static getters = ["getDashboardContent"];

    handle(cmd) {
        switch (cmd.type) {
            case "SET_DASHBOARD_CONTENT":
                this.history.update("content", cmd.content);
                break;
        }
    }

    getDashboardContent() {
        return this.content || DEFAULT_CONTENT;
    }

    import(data) {
        this.history.update("content", data.content);
    }

    export(data) {
        data.content = this.getDashboardContent();
    }
}

registries.corePluginRegistry.add("DashboardContentPlugin", DashboardContentPlugin);
coreTypes.add("SET_DASHBOARD_CONTENT");
registries.inverseCommandRegistry.add("SET_DASHBOARD_CONTENT", (cmd) => [cmd]);
