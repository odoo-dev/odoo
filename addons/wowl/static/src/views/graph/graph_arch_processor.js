/** @odoo-module **/
import { evaluateExpr } from "../../py/index";
import { GROUPABLE_TYPES } from "../view_utils/search_utils";
import { MODES, ORDERS } from "./graph_model";
export function processGraphViewDescription(graphViewDescription) {
  const fields = graphViewDescription.fields || {};
  const arch = graphViewDescription.arch || "<graph/>";
  const parser = new DOMParser();
  const xml = parser.parseFromString(arch, "text/xml");
  const archData = {
    fields,
    groupBy: [],
  };
  parseXML(xml.documentElement, archData);
  return archData;
}
function parseXML(node, data) {
  if (!(node instanceof Element)) {
    return;
  }
  if (node.nodeType === 1) {
    switch (node.tagName) {
      case "graph":
        if (node.getAttribute("disable_linking")) {
          data.disableLinking = Boolean(evaluateExpr(node.getAttribute("disable_linking")));
        }
        if (node.getAttribute("stacked")) {
          data.stacked = Boolean(evaluateExpr(node.getAttribute("stacked")));
        }
        const mode = node.getAttribute("type");
        if (MODES.includes(mode)) {
          data.mode = mode;
        }
        const order = node.getAttribute("order");
        if (ORDERS.includes(order)) {
          data.order = order;
        }
        const title = node.getAttribute("string");
        if (title) {
          data.title = title;
        }
        for (let child of node.childNodes) {
          parseXML(child, data);
        }
        break;
      case "field":
        let fieldName = node.getAttribute("name"); // exists (rng validation)
        if (fieldName === "id") {
          break;
        }
        const isInvisible = Boolean(evaluateExpr(node.getAttribute("invisible") || "0"));
        if (isInvisible) {
          delete data.fields[fieldName]; // good idea??? It was not like that before (see also additionalMeasures and click on dashboard aggregate)
          break;
        }
        // before the string attribute was used eventually in menu "Measures"
        const isDefaultMeasure = node.getAttribute("type") === "measure";
        if (isDefaultMeasure) {
          data.activeMeasure = fieldName;
        } else {
          const { type } = data.fields[fieldName]; // exists (rng validation)
          if (GROUPABLE_TYPES.includes(type)) {
            let groupBy = fieldName;
            const interval = node.getAttribute("interval");
            if (interval) {
              groupBy += `:${interval}`;
            }
            data.groupBy.push(groupBy);
          }
        }
        break;
    }
  }
}
