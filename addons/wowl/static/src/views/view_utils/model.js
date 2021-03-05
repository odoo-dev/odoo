/** @odoo-module **/
import { ON_SAVE_PARAMS_KEY, SEARCH_MENU_TYPES_KEY, useSearch } from "../search/search_model";
import { useBus } from "../../core/hooks";

const { Component, core, hooks } = owl;
const { EventBus } = core;
const { useSubEnv, onWillUpdateProps, onWillStart } = hooks;

const DEFAULTS = {
  domain: [],
  domains: [{ arrayRepr: [], description: null }],
  groupBy: [],
  context: {},
  orderBy: [],
};

const WITH_SEARCH_MODEL_KEY = Symbol("withSearchModel");

// for now useSearch and useModel are similar but SearchModel is not a Model
// --> try to unify in some good way???

export function useModel(params = {}) {
  const component = Component.current;

  const Model = params.Model || component.constructor.Model;

  if (!Model) {
    throw new Error("No model class is provided");
  }

  const env = component.env;
  const props = component.props;
  const hookParams = {
    [SEARCH_MENU_TYPES_KEY]: params.searchMenuTypes,
    [ON_SAVE_PARAMS_KEY]: params.onSaveParams,
  };

  const config = Object.assign(hookParams, props);

  const model = new Model(env, config);

  useBus(model, component, params.onUpdate || component.render);

  onWillStart(async () => {
    await model.load();
  });

  useSubEnv({ model });

  return model;

  onWillUpdateProps(async (nextProps) => {
    const props = component.props;
    const loadParams = {};
    for (const key of Model.keys || searchKeys) {
      if (JSON.stringify(nextProps[key]) !== JSON.stringify(props[key])) {
        loadParams[key] = nextProps[key];
      }
    }
    await load(loadParams, false);
  });
}

let searchKeys = Object.keys(DEFAULTS);
// if (Model.keys) {
//   searchKeys = searchKeys.filter(key => Model.keys.includes(key));
// }

export class Model extends EventBus {
  constructor(env, config) {
    super();

    // const searchModel should always be there for managing actionDomain, actionContext,...

    this.searchModel = useSearch({
      [SEARCH_MENU_TYPES_KEY]: config[SEARCH_MENU_TYPES_KEY],
      [ON_SAVE_PARAMS_KEY]: config[ON_SAVE_PARAMS_KEY],
      onUpdate: async () => {
        const loadParams = {};
        for (const key of searchKeys) {
          loadParams[key] = this.searchModel[key];
        }
        this.load(loadParams);
      },
    });

    for (const key of searchKeys) {
      if (!(key in config)) {
        config[key] = this.searchModel[key];
      }
    }

    this.initialGroupBy = config.groupBy || DEFAULTS.groupBy;

    this.setup(env, config);
  }

  setup(env, config) {
    // should be elsewhere
    if ("groupBy" in config && config.groupBy.length === 0) {
      config.groupBy = this.initialGroupBy;
    }
    if (!("title" in config)) {
      config.title = env._t("Undefined");
    }
  }

  async load() {
    // we could fetch extra domain here and pass it to searchModel
    // for searchPanel part (think of lunch widget for location or
    // click on aggregate with domain in dashboard view)
    // await this.searchModel.load(/** { extra_domain: ... ? } */);
    // the concrete model load data after that
  }
}
