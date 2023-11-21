/** @odoo-module */
import { registry } from "@web/core/registry";
import { Base } from "./related_models";

export class ResUsers extends Base {
    static pythonModel = "res.users";
}

registry.category("pos_available_models").add(ResUsers.pythonModel, ResUsers);
