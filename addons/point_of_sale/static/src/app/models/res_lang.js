/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ResLang extends Base {
    static pythonModel = "res.lang";
}

registry.category("pos_available_models").add(ResLang.pythonModel, ResLang);
