/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosCombo extends Base {
    static pythonModel = "pos.combo";
}

registry.category("pos_available_models").add(PosCombo.pythonModel, PosCombo);
