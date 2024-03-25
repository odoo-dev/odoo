import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestElement } from "../utils/dom_traversal";
import { TableMenu } from "./table_menu";
import { TablePicker } from "./table_picker";

/**
 * This plugin only contains the table ui feature (table picker, menus, ...).
 * All actual table manipulation code is located in the table plugin.
 */
export class TableUIPlugin extends Plugin {
    static name = "table_ui";
    static dependencies = ["overlay", "table"];
    static resources = (p) => ({
        powerboxCommands: [
            {
                name: _t("Table"),
                description: _t("Insert a table"),
                category: "structure",
                fontawesome: "fa-table",
                action(dispatch) {
                    dispatch("OPEN_TABLE_PICKER");
                },
            },
        ],
    });

    setup() {
        /** @type {import("../core/overlay_plugin").Overlay} */
        this.picker = this.shared.createOverlay(TablePicker, {
            dispatch: this.dispatch,
            el: this.editable,
        });

        this.activeTd = null;

        /** @type {import("../core/overlay_plugin").Overlay} */
        this.colMenu = this.shared.createOverlay(TableMenu, {
            position: "top",
            dispatch: this.dispatch,
        });
        this.addDomListener(this.editable, "pointermove", this.onMouseMove);
    }

    handleCommand(command) {
        switch (command) {
            case "OPEN_TABLE_PICKER":
                this.openPicker();
                break;
        }
    }

    openPicker() {
        const range = this.document.getSelection().getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && rect.x === 0) {
            range.startContainer.parentElement.appendChild(this.document.createElement("br"));
        }
        this.picker.open();
    }

    onMouseMove(ev) {
        const target = ev.target;
        if (ev.target.tagName === "TD" && target !== this.activeTd) {
            if (ev.target.isContentEditable) {
                this.setActiveTd(target);
            }
        } else if (this.activeTd) {
            const parentTd = closestElement(target, "td");
            if (!parentTd) {
                this.setActiveTd(null);
            }
        }
    }

    setActiveTd(td) {
        this.activeTd = td;
        if (td) {
            //
            this.colMenu.close();
            this.colMenu.open(td);
        } else {
            this.colMenu.close();
        }
    }
}

registry.category("phoenix_plugins").add(TableUIPlugin.name, TableUIPlugin);
