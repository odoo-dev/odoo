/** @odoo-module **/
export const VIEW_DEFAULT_PROPS = {
  fields: {},
  isEmbedded: false,
  isSample: false,
};
export const VIEW_PROPS = {
  __beforeLeave__: { type: Function, optional: 1 },
  __exportState__: { type: Function, optional: 1 }, // hum hum for export ...
  actionName: { type: String, optional: 1 },
  fields: { type: Object, elements: Object }, // more precision on elements...
  model: String,
  isEmbedded: Boolean,
  isSample: Boolean,
  noContentHelp: { type: String, optional: 1 },
  processedSearchViewDescription: { type: Object, optional: 1 },
  type: String, // ViewType redondant par rapport à static key --> used for Layout
  viewSwitcherEntries: { type: Array, elements: Object, optional: 1 },
};
