/** @odoo-module **/
import { evaluateExpr } from "../../py/index";
import { getGroupBy } from "../view_utils/group_by";
import { GROUPABLE_TYPES } from "../view_utils/search_utils";
import { MODES, ORDERS } from "./graph_model";
export function processGraphViewDescription(searchViewDescription) {
  const fields = searchViewDescription.fields || {};
  const arch = searchViewDescription.arch || "<graph/>";
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
          data.disableLinking = !!JSON.parse(node.getAttribute("disable_linking"));
        }
        const mode = node.getAttribute("type"); //grr...
        if (mode && MODES.includes(mode)) {
          data.mode = mode;
        }
        const order = node.getAttribute("order");
        if (order && ORDERS.includes(order)) {
          data.order = order;
        }
        const stacked = node.getAttribute("stacked");
        if (stacked && stacked === "False") {
          // weird to ask it to be exactly 'False'
          data.stacked = false;
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
        const isInvisible = Boolean(evaluateExpr(node.getAttribute("invisible") || "False"));
        if (isInvisible) {
          delete data.fields[fieldName];
          break;
        }
        const isDefaultMeasure = node.getAttribute("type") === "measure";
        if (isDefaultMeasure) {
          data.activeMeasure = fieldName;
        } else {
          const fieldType = data.fields[fieldName].type; // exists (rng validation)
          if (GROUPABLE_TYPES.includes(fieldType)) {
            const groupBy = getGroupBy(fieldName, data.fields);
            data.groupBy.push(groupBy);
          }
        }
        break;
    }
  }
}
