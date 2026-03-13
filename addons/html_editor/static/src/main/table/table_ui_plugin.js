import { reactive } from "@web/owl2/utils";
import { Plugin } from "@html_editor/plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { _t } from "@web/core/l10n/translation";
import { TableMenu } from "./table_menu";
import { TablePicker } from "./table_picker";
import { isHtmlContentSupported } from "@html_editor/core/selection_plugin";
import { TableDragDrop } from "./table_drag_drop";

/**
 * This plugin only contains the table ui feature (table picker, menus, ...).
 * All actual table manipulation code is located in the table plugin.
 */
export class TableUIPlugin extends Plugin {
    static id = "tableUi";
    static dependencies = ["domMutation", "overlay", "table"];
    /** @type {import("plugins").EditorResources} */
    resources = {
        user_commands: [
            {
                id: "openTablePicker",
                title: _t("Table"),
                description: _t("Insert a table"),
                icon: "fa-table",
                run: this.openPickerOrInsertTable.bind(this),
                isAvailable: isHtmlContentSupported,
            },
        ],
        powerbox_items: [
            {
                categoryId: "structure",
                commandId: "openTablePicker",
            },
        ],
    };

    setup() {
        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.picker = this.dependencies.overlay.createOverlay(TablePicker, {
            positionOptions: {
                updatePositionOnResize: false,
                onPositioned: (picker, position) => {
                    const popperRect = picker.getBoundingClientRect();
                    const { left } = position;
                    if (this.config.direction === "rtl") {
                        // position from the right instead of the left as it is needed
                        // to ensure the expand animation is properly done
                        picker.style.right = `${window.innerWidth - left - popperRect.width}px`;
                        picker.style.removeProperty("left");
                    }
                },
            },
        });

        this.activeTd = null;

        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.colMenu = this.dependencies.overlay.createOverlay(TableMenu, {
            positionOptions: {
                position: "top-fit",
                flip: false,
            },
        });
        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.rowMenu = this.dependencies.overlay.createOverlay(TableMenu, {
            positionOptions: {
                position: "left-fit",
            },
        });
        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.tableDragDropOverlay = this.dependencies.overlay.createOverlay(TableDragDrop);
        this.addDomListener(this.document, "pointermove", this.onMouseMove);
        const closeMenus = () => {
            if (this.isMenuOpened) {
                this.isMenuOpened = false;
                this.colMenu.close();
                this.rowMenu.close();
            }
        };
        this.addDomListener(this.document, "scroll", closeMenus, true);
    }

    openPicker() {
        this.picker.open({
            props: {
                editable: this.editable,
                overlay: this.picker,
                direction: this.config.direction || "ltr",
                insertTable: (params) => this.dependencies.table.insertTable(params),
            },
        });
    }

    openPickerOrInsertTable() {
        if (this.services.ui.isSmall) {
            this.dependencies.table.insertTable({ cols: 3, rows: 3 });
        } else {
            this.openPicker();
        }
    }

    onMouseMove(ev) {
        const target = ev.target;
        if (this.isMenuOpened) {
            return;
        }
        if (
            ["TD", "TH"].includes(target.tagName) &&
            target !== this.activeTd &&
            this.editable.contains(target)
        ) {
            if (ev.target.isContentEditable && closestElement(target, "table").isContentEditable) {
                this.setActiveTd(target);
            }
        } else if (this.activeTd) {
            const isOverlay = target.closest(".o-overlay-container");
            if (isOverlay) {
                return;
            }
            const parentTd = closestElement(target, "td, th");
            if (!parentTd) {
                this.setActiveTd(null);
            }
        }
    }

    createDropdownState(menuToClose) {
        const dropdownState = reactive({
            isOpen: false,
            open: () => {
                dropdownState.isOpen = true;
                menuToClose.close();
                this.isMenuOpened = true;
            },
            close: () => {
                dropdownState.isOpen = false;
                this.isMenuOpened = false;
            },
        });
        return dropdownState;
    }

    setActiveTd(td) {
        this.activeTd = td;
        this.colMenu.close();
        this.rowMenu.close();
        if (!td) {
            return;
        }
        const withCommit =
            (fn) =>
            (...args) => {
                fn(...args);
                this.dependencies.domMutation.commit();
            };
        const tableMethods = {
            moveColumn: withCommit(this.dependencies.table.moveColumn),
            addColumn: withCommit(this.dependencies.table.addColumn),
            removeColumn: withCommit(this.dependencies.table.removeColumn),
            moveRow: withCommit(this.dependencies.table.moveRow),
            addRow: withCommit(this.dependencies.table.addRow),
            removeRow: withCommit(this.dependencies.table.removeRow),
            turnIntoHeader: withCommit(this.dependencies.table.turnIntoHeader),
            turnIntoRow: withCommit(this.dependencies.table.turnIntoRow),
            resetRowHeight: withCommit(this.dependencies.table.resetRowHeight),
            resetColumnWidth: withCommit(this.dependencies.table.resetColumnWidth),
            resetTableSize: withCommit(this.dependencies.table.resetTableSize),
            clearColumnContent: withCommit(this.dependencies.table.clearColumnContent),
            clearRowContent: withCommit(this.dependencies.table.clearRowContent),
            toggleAlternatingRows: withCommit(this.dependencies.table.toggleAlternatingRows),
        };
        if (td.cellIndex === 0) {
            this.rowMenu.open({
                target: td,
                props: {
                    type: "row",
                    overlay: this.rowMenu,
                    tableDragDropOverlay: this.tableDragDropOverlay,
                    target: td,
                    dropdownState: this.createDropdownState(this.colMenu),
                    document: this.document,
                    editable: this.editable,
                    ...tableMethods,
                },
            });
        }
        if (td.parentElement.rowIndex === 0) {
            this.colMenu.open({
                target: td,
                props: {
                    type: "column",
                    overlay: this.colMenu,
                    target: td,
                    tableDragDropOverlay: this.tableDragDropOverlay,
                    dropdownState: this.createDropdownState(this.rowMenu),
                    direction: this.config.direction || "ltr",
                    document: this.document,
                    editable: this.editable,
                    ...tableMethods,
                },
            });
        }
    }
}
