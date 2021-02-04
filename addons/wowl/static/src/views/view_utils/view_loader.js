/** @odoo-module **/
const { Component, tags } = owl;
import { useService } from "../../core/hooks";
import { processSearchViewDescription } from "./search_utils";
const { xml } = tags;
export class ViewLoader extends Component {
  constructor() {
    super(...arguments);
    if (!("type" in this.props)) {
      throw Error(`ViewLoader props should have a "type" key`);
    }
    if (!("model" in this.props)) {
      throw Error(`ViewLoader props should have a "model" key`);
    }

    this._viewManagerService = useService("view_manager");
    this._modelService = useService("model");
    this.View = null;
    this.viewProps = {};
    // sanitize props.views (cannot be done with static key defaultProps)
    this.views = [];
    const temp = {
      [this.props.type]: false,
    };
    for (const [id, type] of this.props.views) {
      temp[type] = id;
    }
    for (const type of Object.keys(temp)) {
      this.views.push([temp[type], type]);
    }
  }
  async willStart() {
    const params = {
      model: this.props.model,
      views: this.views,
      context: this.props.context,
    };
    const options = {
      actionId: this.props.actionId,
      context: this.props.context,
      withActionMenus: this.props.withActionMenus,
      withFilters: this.props.withFilters,
    };
    const viewDescriptions = await this._viewManagerService.loadViews(params, options); // view manager could return View and propsFromArch,...

    const descr = viewDescriptions[this.props.type];
    this.viewProps.arch = descr.arch;
    this.viewProps.viewId = descr.view_id;
    this.viewProps.fields = descr.fields;
    this.viewProps.modelName = this.props.model;
    let propsFromArch = {};

    const parser = new DOMParser();
    const xml = parser.parseFromString(descr.arch, "text/xml");
    const rootNode = xml.documentElement;
    let processArch;
    if (rootNode.hasAttribute("js_class")) {
      const jsViewType = rootNode.getAttribute("js_class");
      this.View = odoo.viewRegistry.get(jsViewType);
      processArch = this.View.processArch || odoo.viewRegistry.get(this.props.type).processArch;
    } else {
      this.View = odoo.viewRegistry.get(this.props.type);
      processArch = this.View.processArch;
    }

    if (processArch) {
      propsFromArch = processArch(descr); // could be done in viewManager...
    }

    if (this.views.find((v) => v[1] === "search")) {
      // could be done in viewManager...
      const searchDefaults = {};
      for (const key in this.props.context) {
        const match = /^search_default_(.*)$/.exec(key);
        if (match) {
          const val = this.props.context[key];
          if (val) {
            searchDefaults[match[1]] = val;
          }
        }
      }
      this.viewProps.processedSearchViewDescription = await processSearchViewDescription(
        viewDescriptions.search,
        this._modelService,
        searchDefaults
      );
    }

    // to do
    // extract everything necessary from action and put it into viewProps?
    this.viewProps.limit = this.props.action.limit;

    Object.assign(this.viewProps, this.props, { views: this.views }, propsFromArch);

    if (this.View.props) {
      // this is to make props validation work for views. Is it the good way?
      for (const key in this.viewProps) {
        if (!(key in this.View.props)) {
          delete this.viewProps[key];
        }
      }
    }
  }
}
ViewLoader.template = xml`<t t-component="View" t-props="viewProps"/>`;

ViewLoader.defaultProps = {
  action: {}, // develop,
  actionId: false, // ?
  context: {},
  views: [],
  withActionMenus: false,
  withFilters: false,
};
// we cannot hope to make props validation here (user might want pass anything in viewLoader props...) so we do something in constructor
// to enforce "type" and "model" in props.
