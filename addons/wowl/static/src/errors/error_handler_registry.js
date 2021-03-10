/** @odoo-module **/

import { OrderedRegistry } from "../core/ordered_registry";

export const errorHandlerRegistry = (odoo.errorHandlerRegistry = new OrderedRegistry());
