import { Context } from "../core/context";
import { Service, OdooEnv, ViewId, ViewType } from "../types";

export interface IrFilter {
  user_id: [number, string] | false;
  sort: string;
  context: string;
  name: string;
  domain: string;
  id: number;
  is_default: boolean;
  model_id: string;
  action_id: [number, string] | false;
}

export interface ViewDescription {
  arch: string;
  type: ViewType;
  view_id: number;
  fields: { [key: string]: any };
  irFilters?: IrFilter[];
}

export interface ViewDescriptions {
  [key: string]: ViewDescription;
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
  loadViews(params: LoadViewsParams, options: LoadViewsOptions): Promise<ViewDescriptions>;
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
     * @returns {Promise<ViewDescriptions>}
     */
    async function loadViews(
      params: LoadViewsParams,
      options: LoadViewsOptions
    ): Promise<ViewDescriptions> {
      const key = JSON.stringify([params.model, params.views, params.context, options]);
      if (!cache[key]) {
        cache[key] = modelService(params.model)
          .call("load_views", [], {
            views: params.views,
            options: {
              action_id: options.actionId || false,
              load_filters: options.withFilters || false,
              toolbar: options.withActionMenus || false,
            },
            context: params.context,
          })
          .then((result) => {
            const viewDescriptions: ViewDescriptions = result; // we add keys in result for legacy! ---> c'est moche!
            for (const [_, viewType] of params.views) {
              const viewDescription: ViewDescription = (result as any).fields_views[viewType];
              viewDescription.fields = Object.assign(
                {},
                (result as any).fields,
                viewDescription.fields
              ); // before a deep freeze was done.
              if (viewType === "search" && options.withFilters) {
                viewDescription.irFilters = (result as any).filters;
              }
              viewDescriptions[viewType] = viewDescription;
            }
            return viewDescriptions;
          });
      }
      return await cache[key]; // FIXME: clarify the API --> already better but ...
    }
    return { loadViews };
  },
};
