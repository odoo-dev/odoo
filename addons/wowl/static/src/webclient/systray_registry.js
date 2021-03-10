/** @odoo-module **/

import { OrderedRegistry } from "../core/ordered_registry";

export const systrayRegistry = (odoo.systrayRegistry = new OrderedRegistry());
