import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestElement } from "../utils/dom_traversal";
import { TableMenu } from "./table_menu";

export class TableUIPlugin extends Plugin {
    static name = "table_ui";
    static dependencies = ["overlay"];

    setup() {
        this.activeTd = null;

        /** @type {import("../core/overlay_plugin").Overlay} */
        this.colMenu = this.shared.createOverlay(TableMenu, {
            position: "top",
            dispatch: this.dispatch,
        });
        this.addDomListener(this.editable, "mousemove", this.onMouseMove);
    }

    onMouseMove(ev) {
        const target = ev.target;
        if (ev.target.tagName === "TD" && target !== this.activeTd) {
            this.setActiveTd(target);
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
            this.colMenu.open(td);
        } else {
            this.colMenu.close();
        }
    }
}

registry.category("phoenix_plugins").add(TableUIPlugin.name, TableUIPlugin);
