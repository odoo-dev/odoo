/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class DecimalPrecision extends Base {
    static pythonModel = "decimal.precision";
}

registry.category("pos_available_models").add(DecimalPrecision.pythonModel, DecimalPrecision);
