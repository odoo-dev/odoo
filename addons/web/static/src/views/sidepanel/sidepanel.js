/** @odoo-module **/

import { Component, useRef, useState, useEffect, useExternalListener } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { SidePanelFormView } from "./sidepanel_form_view";

export class SidePanel extends Component {
    static template = "web.SidePanel";
    static components = { SidePanelFormView };
    static props = {};

    setup() {
        this.action = useService("action");
        this.sidepanelService = useService("sidepanel");
        this.panelRef = useRef("panel");

        this.sidepanelState = useState(this.sidepanelService.state);

        useEffect(() => {
            if (this.panelRef.el) {
                this.positionPanel();
                this.panelRef.el.focus();
            }
        }, () => [this.sidepanelState.isOpen]);

        useExternalListener(window, "resize", () => {
            this.positionPanel();
        });
    }

    positionPanel() {
        const cpEl = document.querySelector(".o_control_panel");

        if (cpEl && this.panelRef.el) {
            this.panelRef.el.style.top = cpEl.offsetTop + cpEl.offsetHeight + "px";
        }
    }

    get isOpen() {
        return this.sidepanelState.isOpen;
    }

    close() {
        this.sidepanelService.close();
    }

    togglePin() {
        this.sidepanelService.togglePinned();
    }

    toggleFold() {
        this.sidepanelService.toggleFolded();
    }

    openInFullView() {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: this.sidepanelState.resModel,
            res_id: this.sidepanelState.resId,
            views: [[this.sidepanelState.viewId || false, "form"]],
            target: "current",
            context: this.sidepanelState.context,
        });
        this.close();
    }

    onKeydown(ev) {
        if (ev.key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            this.close();
        }
    }

    onRecordSaved(record) {
        // 🤷🏻‍♂️
    }
}