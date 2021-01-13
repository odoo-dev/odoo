/** @odoo-module **/
const { Component, tags } = owl;
import { useService } from "../../core/hooks";
import { processGraphViewDescription } from "../graph/graph_arch_processor";
import { processSearchViewDescription } from "./search_utils";
const { xml } = tags;
export class ViewLoader extends Component {
  constructor() {
    super(...arguments);
    this._viewManagerService = useService("view_manager");
    this._modelService = useService("model");
    this.viewProps = {};
  }
  async willStart() {
    const params = {
      model: this.props.model,
      views: this.props.views,
      context: this.props.context,
    };
    const options = {
      actionId: this.props.actionId,
      context: this.props.context,
      withActionMenus: this.props.withActionMenus,
      withFilters: this.props.withFilters,
    };
    const viewDescriptions = await this._viewManagerService.loadViews(params, options);
    const descr = viewDescriptions[this.props.type];
    this.viewProps.arch = descr.arch;
    this.viewProps.viewId = descr.view_id;
    this.viewProps.fields = descr.fields;
    let propsFromArch = {};
    if (this.props.type === "graph") {
      propsFromArch = processGraphViewDescription(descr);
    }
    Object.assign(this.viewProps, this.props, propsFromArch);
    // extract props from action
    this.viewProps.limit = this.props.action.limit;
    if (this.props.views.find((v) => v[1] === "search")) {
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
    // todo:
    // white list props to put into viewProps?
    // extract everything necessary from action and put it into viewProps
    // handle jsClass here (+ write a test), and probably remove props.View (type is enough)
  }
}
ViewLoader.template = xml`<t t-component="props.View" t-props="viewProps"/>`;
