import { _t } from "@web/core/l10n/translation";
import { Plugin } from "@html_editor/plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { TableMenu } from "./table_menu";
import { TablePicker } from "./table_picker";

/**
 * This plugin only contains the table ui feature (table picker, menus, ...).
 * All actual table manipulation code is located in the table plugin.
 */
export class TableUIPlugin extends Plugin {
    static name = "table_ui";
    static dependencies = ["overlay", "table"];
    /** @type { (p: TableUIPlugin) => Record<string, any> } */
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
        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.picker = this.shared.createOverlay(TablePicker, {
            position: "bottom-start",
        });

        this.activeTd = null;

        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.colMenu = this.shared.createOverlay(TableMenu, {
            position: "top-fit",
            offsetY: 0,
        });
        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.rowMenu = this.shared.createOverlay(TableMenu, {
            position: "left-fit",
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
        this.picker.open({
            props: {
                dispatch: this.dispatch,
                editable: this.editable,
                overlay: this.picker,
            },
        });
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
        this.colMenu.close();
        this.rowMenu.close();
        if (td) {
            if (td.cellIndex === 0) {
                this.rowMenu.open({
                    target: td,
                    props: {
                        type: "row",
                        dispatch: this.dispatch,
                        overlay: this.rowMenu,
                        target: td,
                    },
                });
            }
            if (td.parentElement.rowIndex === 0) {
                this.colMenu.open({
                    target: td,
                    props: {
                        type: "column",
                        dispatch: this.dispatch,
                        overlay: this.colMenu,
                        target: td,
                    },
                });
            }
        }
    }
}
