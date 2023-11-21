/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosComboLine extends Base {
    static pythonModel = "pos.combo.line";
}

registry.category("pos_available_models").add(PosComboLine.pythonModel, PosComboLine);
