import { Context, Service, OdooEnv, ViewId, ViewType } from "../types";

export interface ViewDefinition {
  arch: string;
  type: ViewType;
  viewId: number;
  fields: {[key: string]: any};
}

interface ViewDefinitions {
  [key: string]: ViewDefinition;
}

interface LoadViewsOptions {
  actionId?: number;
  context?: Context;
  withActionMenus?: boolean;
  withFilters?: boolean;
}

interface ViewManager {
  loadViews(
    model: string,
    views: [ViewId, ViewType][],
    options: LoadViewsOptions
  ): Promise<ViewDefinitions>;
}

export const viewManagerService: Service<ViewManager> = {
  name: "view_manager",
  dependencies: ["model"],
  deploy(env: OdooEnv): ViewManager {
    const modelService = env.services.model;
    const cache: { [key: string]: Promise<any> } = {};

    /**
     * Generates an hash key according to some params.
     *
     * @private
     * @param {string} model
     * @param {[ViewId, ViewType][]} views something like [[20, 'kanban'], [false, 'form']]
     * @returns {string}
     */
    function _genKey(model: string, views: [ViewId, ViewType][]): string {
      return JSON.stringify([model, views]);
    }

    /**
     * Loads various information concerning views: fields_view for each view,
     * fields of the corresponding model, and optionally the filters.
     *
     * @param {string} model
     * @param {[ViewId, ViewType][]} views something like [[20, 'kanban'], [false, 'form']]
     * @returns {Promise<ViewDefinitions>}
     */
    async function loadViews(
      model: string,
      views: [ViewId, ViewType][],
      options: LoadViewsOptions
    ): Promise<ViewDefinitions> {
      const key = _genKey(model, views);
      if (!cache[key]) {
        cache[key] = modelService(model).call("load_views", [], {
          views,
          options: {
            action_id: options.actionId || false,
            context: options.context || {},
            load_filters: options.withFilters || false,
            toolbar: options.withActionMenus || false,
          },
        });
      }
      const data = await cache[key];
      return data.fields_views;
    }
    return { loadViews };
  },
};
