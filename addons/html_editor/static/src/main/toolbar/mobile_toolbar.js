import { useExternalListener } from "@web/owl2/utils";
import { Component, onMounted, signal } from "@odoo/owl";
import { Toolbar } from "./toolbar";

export class ToolbarMobile extends Component {
    static template = "html_editor.MobileToolbar";
    static props = ["*"];
    static components = {
        Toolbar,
    };

    toolbarRef = signal(null);

    setup() {
        useExternalListener(window.visualViewport, "resize", this.fixToolbarPosition);
        useExternalListener(window.visualViewport, "scroll", this.fixToolbarPosition);
        onMounted(() => {
            this.fixToolbarPosition();
        });
    }

    /**
     * Fixes the position of the toolbar for the keyboard height.
     */
    fixToolbarPosition() {
        const el = this.toolbarRef();
        if (!el) {
            return;
        }
        const keyboardHeight =
            window.innerHeight - (window.visualViewport.height + window.visualViewport.offsetTop);
        if (keyboardHeight > 0) {
            el.style.bottom = `${keyboardHeight}px`;
        } else {
            el.style.bottom = `0px`;
        }
    }
}
