/** @odoo-module **/

import { registry } from "@web/core/registry";
import { formView } from "@web/views/form/form_view";

import { SaleOrderFormController } from "./sale_order_controller";

export const SaleOrderFormView = Object.assign({}, formView, {
    Controller: SaleOrderFormController,
});

registry.category("views").add("sale_order_form_view", SaleOrderFormView);
