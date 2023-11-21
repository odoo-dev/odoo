/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class PosSession extends Base {
    static pythonModel = "pos.session";
}

registry.category("pos_available_models").add(PosSession.pythonModel, PosSession);
