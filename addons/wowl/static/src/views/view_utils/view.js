/** @odoo-module **/

import { useService } from "../../core/hooks";
import { KeepLast } from "../../utils/concurrency";
import { processSearchViewDescription } from "../search/search_utils";

const { Component, tags } = owl;
const { xml } = tags;

/**
 * @typedef {Object} ViewProps
 * @property {string} model
 * @property {string} [arch]
 * @property {string} [type]
 * @property {string} [jsClass]
 * @property {[number,string][]} [views]
 * ++ search prop: domain,...
 * ++ configuration params: withFilters,...
 */

export class View extends Component {
  setup() {
    if (!("type" in this.props || "jsClass" in this.props)) {
      throw Error(`View props should have a "type" key or a "jsClass" key`);
    }
    if (!("model" in this.props)) {
      throw Error(`View props should have a "model" key`);
    }

    this._viewService = useService("view");
    this._modelService = useService("model");

    this.keepLast = new KeepLast();

    this.ViewClass = null;
    this.viewProps = null;
    this.key = null;
  }

  async willStart() {
    await this.load(this.props);
  }

  async willUpdateProps(nextProps) {
    await this.load(nextProps);
  }

  async load(props) {
    const { ViewClass, viewProps } = await this.keepLast.add(this._load(props)); // keepLast really usefull?
    this.ViewClass = ViewClass;
    this.viewProps = viewProps;
    const { model, fields } = viewProps;
    this.key = JSON.stringify([model, fields]); // keep keys that when changed force concrete view recreation
    // ask for some export (in order to keep state).
    // concrete view could trigger changes on props to view here! maybe?
  }

  async _load(props) {
    let ViewClass;
    let viewProps;

    let type = props.type;
    if (!type) {
      ViewClass = odoo.viewRegistry.get(props.jsClass);
      type = ViewClass.type;
    }

    const typeAbsent = props.views.findIndex((v) => v[1] === type) === -1;
    const views = typeAbsent ? [...props.views, [false, type]] : props.views;

    const { actionId, context, model, withActionMenus, withFilters } = props;
    const params = { model, views, context };
    const options = { actionId, context, withActionMenus, withFilters };
    const viewDescriptions = await this._viewService.loadViews(params, options);

    // we could maybe accept viewId as props and

    const viewDescription = viewDescriptions[type];

    let { arch, jsClass } = props;

    if (!arch) {
      arch = viewDescription.arch;
    }

    if (!jsClass) {
      const parser = new DOMParser();
      const xml = parser.parseFromString(arch, "text/xml");
      const rootNode = xml.documentElement;
      if (rootNode.hasAttribute("js_class")) {
        jsClass = rootNode.getAttribute("js_class");
      }
    }

    let processViewDescription;
    if (jsClass) {
      ViewClass = odoo.viewRegistry.get(jsClass);
      processViewDescription =
        ViewClass.processViewDescription || odoo.viewRegistry.get(type).processViewDescription;
    } else {
      ViewClass = odoo.viewRegistry.get(type);
      processViewDescription = ViewClass.processViewDescription;
    }

    const { limit, name: actionName } = props.action;

    viewProps = Object.assign({ limit, actionName }, props, { views });

    let propsFromArch = viewDescription;
    propsFromArch.arch = arch;

    if (processViewDescription) {
      propsFromArch = processViewDescription(viewDescription);
    }

    const searchViewDescription = viewDescriptions.search;
    if (searchViewDescription) {
      propsFromArch.processedSearchViewDescription = await processSearchViewDescription(
        searchViewDescription,
        this._modelService,
        context
      );
    }

    Object.assign(viewProps, propsFromArch);

    if (ViewClass.props) {
      for (const key in viewProps) {
        if (!(key in ViewClass.props)) {
          delete viewProps[key];
        }
      }
    }

    return { ViewClass, viewProps };
  }
}
View.template = xml`<t t-component="ViewClass" t-props="viewProps" t-key="key"/>`;
View.defaultProps = {
  action: {}, // develop,
  actionId: false, // ?
  context: {},
  views: [],
  withActionMenus: false,
  withFilters: false,
};
// we cannot hope to make props validation here (user might want pass anything in as view props...) so we do something in constructor
// to enforce "type" and "model" in props.

// Ideas: - allow viewId as props and call the proper route?
