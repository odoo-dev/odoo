/** @odoo-module **/
import { Dialog } from "@web/core/dialog/dialog";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";

export class productHsnDialog extends Component {
    static components = { Dialog };
    static template = "l10n_in_pos.productHsnDialog";
    static props = {
        close: Function,
    };

    setup() {
        this.pos = usePos();

        // useService may throw in some POS builds if the service isn't registered,
        // so guard it in try/catch. We'll keep `this.action` undefined when not available.
        try {
            this.action = useService("action");
        } catch (err) {
            // service not available in this runtime
            this.action = undefined;
            console.warn("productHsnDialog: 'action' service not available in POS runtime", err);
        }
    }

    // make redirect async because doAction is async
    async redirect() {
        // close dialog immediately (keeps UI consistent)
        try {
            this.props.close();
        } catch (err) {
            console.warn("productHsnDialog: error closing dialog", err);
        }

        const domain = [
            ["available_in_pos", "=", true],
            ["l10n_in_hsn_code", "=", false],
            ["taxes_id", "!=", false],
        ];

        // If action service exists, prefer using it (opens backend view in web client)
        if (this.action && typeof this.action.doAction === "function") {
            try {
                await this.action.doAction({
                    type: "ir.actions.act_window",
                    res_model: "product.template",
                    domain: domain,
                    views: [[false, "list"]],
                    target: "current",
                });
                return;
            } catch (err) {
                // action failed for some reason — log and fall back to URL
                console.error("productHsnDialog: action.doAction failed, falling back to URL", err);
            }
        } else {
            console.info("productHsnDialog: action service not available, falling back to URL navigation");
        }

        // Fallback: open backend list view using web client hash with encoded domain
        try {
            const encodedDomain = encodeURIComponent(JSON.stringify(domain));
            // Use product.template list view
            window.location.href = `/web#model=product.template&view_type=list&domain=${encodedDomain}`;
        } catch (err) {
            console.error("productHsnDialog: fallback navigation failed", err);
        }
    }

    onClose() {
        try {
            this.props.close();
        } catch (err) {
            console.warn("productHsnDialog: onClose error", err);
        }
    }
}
