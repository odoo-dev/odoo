/** @odoo-module **/

import { Registry } from "../core/registry";
import { GraphView } from "./graph/graph_view";

export const viewRegistry = (odoo.viewRegistry = new Registry());

viewRegistry.add("graph", GraphView);
