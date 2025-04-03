import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosConfig extends Base {
    static pythonModel = "pos.config";

    initState() {
        super.initState();
        this.uiState = {};
    }

    get useProxy() {
        return (
            this.is_posbox &&
            (this.iface_electronic_scale ||
                this.iface_print_via_proxy ||
                this.iface_scan_via_proxy ||
                this.iface_customer_facing_display_via_proxy)
        );
    }

    get isShareable() {
        return this.raw.trusted_config_ids.length > 0;
    }

    get shouldLoadOrder() {
        return this.raw.trusted_config_ids.length > 0;
    }

    get preparationCategories() {
        return new Set(this.printer_ids.flatMap((p) => p.product_categories_ids).map((c) => c.id));
    }

    /**
     * Maps the category to the related printers.
     */
    get categoryPrintersMap() {
        const map = new Map();
        for (const printer of this.models["pos.printer"].getAll()) {
            for (const posCateg of printer.product_categories_ids) {
                if (!map.has(posCateg.id)) {
                    map.set(posCateg.id, []);
                }
                map.get(posCateg.id).push(printer);
            }
        }
        return map;
    }
}

registry.category("pos_available_models").add(PosConfig.pythonModel, PosConfig);
