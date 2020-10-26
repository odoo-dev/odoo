import { Context, Service, OdooEnv, ViewId, ViewType } from "../types";

export interface ViewDefinition {
  arch: string;
  type: ViewType;
  viewId: number;
  fields: { [key: string]: any };
}

interface ViewDefinitions {
  [key: string]: ViewDefinition;
}

interface LoadViewsParams {
  model: string;
  views: [ViewId, ViewType][];
  context: Context;
}

interface LoadViewsOptions {
  actionId?: number;
  withActionMenus?: boolean;
  withFilters?: boolean;
}

interface ViewManager {
  loadViews(params: LoadViewsParams, options: LoadViewsOptions): Promise<ViewDefinitions>;
}

export const viewManagerService: Service<ViewManager> = {
  name: "view_manager",
  dependencies: ["model"],
  deploy(env: OdooEnv): ViewManager {
    const modelService = env.services.model;
    const cache: { [key: string]: Promise<any> } = {};

    /**
     * Loads various information concerning views: fields_view for each view,
     * fields of the corresponding model, and optionally the filters.
     *
     * @param {params} LoadViewsParams
     * @param {options} LoadViewsOptions
     * @returns {Promise<ViewDefinitions>}
     */
    async function loadViews(
      params: LoadViewsParams,
      options: LoadViewsOptions
    ): Promise<ViewDefinitions> {
      const key = JSON.stringify([params.model, params.views, params.context, options]);
      if (!cache[key]) {
        cache[key] = modelService(params.model).call("load_views", [], {
          views: params.views,
          options: {
            action_id: options.actionId || false,
            load_filters: options.withFilters || false,
            toolbar: options.withActionMenus || false,
          },
          context: params.context,
        });
      }
      const data = await cache[key];
      return data.fields_views;
    }
    return { loadViews };
  },
};
