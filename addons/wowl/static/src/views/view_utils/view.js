/** @odoo-module **/

import { useBus, useService } from "../../core/hooks";
import { KeepLast } from "../../utils/concurrency";

import { SearchModel } from "../search/search_model";
import { processSearchViewDescription } from "../search/search_utils";

const { Component, hooks, tags } = owl;
const { useSubEnv } = hooks;
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
    this._viewService = useService("view");
    this._modelService = useService("model");

    this.keepLast = new KeepLast();

    this.ViewClass = null;
    this.viewProps = null;

    // this.key = null;

    this.searchModel = new SearchModel();
    this.initialGroupBy = null;

    useBus(this.searchModel, "update", () => {
      const { searchQuery } = this.searchModel;
      if (searchQuery.groupBy.length === 0) {
        searchQuery.groupBy = this.initialGroupBy;
      }
      Object.assign(this.viewProps, searchQuery);

      this.filter(this.viewProps, this.ViewClass);
      this.render();
    });

    useSubEnv({ searchModel: this.searchModel });
  }

  async willStart() {
    await this.load(this.props);
  }

  async willUpdateProps(nextProps) {
    await this.load(nextProps);
  }

  async load(props) {
    if (!("type" in props || "jsClass" in props)) {
      throw Error(`View props should have a "type" key or a "jsClass" key`);
    }
    if (!("model" in props)) {
      throw Error(`View props should have a "model" key`);
    }

    const { ViewClass, viewProps } = await this.keepLast.add(this._load(props)); // keepLast really usefull?
    this.ViewClass = ViewClass;
    this.viewProps = viewProps;
    // const { model, fields } = viewProps;
    // this.key = JSON.stringify([model, fields]); // keep keys that when changed force concrete view recreation
    // // ask for some export (in order to keep state).
    // // concrete view could trigger changes on props to view here! maybe?
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

    // we could maybe accept viewId as props

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

    Object.assign(viewProps, propsFromArch);

    //////////////////////////////////////////////////////////////////////////
    // search model managment
    //////////////////////////////////////////////////////////////////////////

    const searchViewDescription = viewDescriptions.search;
    let processedSearchViewDescription;
    if (searchViewDescription) {
      if (props.searchArch) {
        searchViewDescription.arch = props.searchArch;
      }
      const searchDefaults = {};
      for (const key in context) {
        const match = /^search_default_(.*)$/.exec(key);
        if (match) {
          const val = context[key];
          if (val) {
            searchDefaults[match[1]] = val;
          }
          delete context[key];
        }
      }
      processedSearchViewDescription = await processSearchViewDescription(
        searchViewDescription,
        this._modelService,
        searchDefaults
      );
    }

    const config = Object.assign({}, { processedSearchViewDescription }, props);
    await this.searchModel.load(config);
    let { searchQuery } = this.searchModel;

    const { defaultGroupBy } = viewProps;

    if (defaultGroupBy && defaultGroupBy.length) {
      searchQuery.groupBy = defaultGroupBy;
    }
    if (!this.initialGroupBy) {
      this.initialGroupBy = searchQuery.groupBy;
    }
    if (viewProps.domains) {
      searchQuery.domains = viewProps.domains; // temporary
    }

    Object.assign(viewProps, searchQuery);

    //////////////////////////////////////////////////////////////////////////
    // search model managment
    //////////////////////////////////////////////////////////////////////////

    this.filter(viewProps, ViewClass);

    return { ViewClass, viewProps };
  }

  filter(viewProps, ViewClass) {
    if (ViewClass.props) {
      for (const key in viewProps) {
        if (!(key in ViewClass.props)) {
          delete viewProps[key];
        }
      }
    }
  }
}
View.template = xml`<t t-component="ViewClass" t-props="viewProps"/>`;
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
