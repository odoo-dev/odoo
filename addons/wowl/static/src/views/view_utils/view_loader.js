/** @odoo-module **/
const { Component, tags } = owl;
import { useService } from "../../core/hooks";
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
    this.View = null;
    this.viewProps = {};
    // 'sanitize' props.views (cannot be done with static key defaultProps)
    const { type, views } = this.props;
    let typeAbsent = views.findIndex((v) => v[1] === type) === -1;
    this.views = typeAbsent ? [...views, [false, type]] : views;
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

    const { View, viewProps: propsFromArch } = viewDescriptions[this.props.type];
    this.View = View;
    this.viewProps = Object.assign(
      { limit: this.props.action.limit },
      this.props,
      { views: this.views },
      propsFromArch
    );

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
