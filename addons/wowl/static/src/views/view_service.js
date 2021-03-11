/** @odoo-module **/
import { serviceRegistry } from "../webclient/service_registry";

// How do we manage interfaces, types,... ?

// export interface IrFilter {
//   user_id: [number, string] | false;
//   sort: string;
//   context: string;
//   name: string;
//   domain: string;
//   id: number;
//   is_default: boolean;
//   model_id: string;
//   action_id: [number, string] | false;
// }

/**
 * @typedef {Object} IrFilter
 * @property {[number, string] | false} user_id
 * @property {string} sort
 * @property {string} context
 * @property {string} name
 * @property {string} domain
 * @property {number} id
 * @property {boolean} is_default
 * @property {string} model_id
 * @property {[number, string] | false} action_id
 */

// export interface ViewDescription {
//   arch: string;
//   fields: { [key: string]: any };

//   type: ViewType;
//   view_id: number;

//   irFilters?: IrFilter[];
// }

/**
 * @typedef {Object} ViewDescription
 * @property {string} arch
 * @property {Object} fields (type fields in fact)
 *
 * @property {string} type (type viewType in fact)
 * @property {number} view_id
 *
 * @property {IrFilter[]} [irFilters]
 */

// export interface ViewDescriptions {
//   [key: string]: ViewDescription;
// }

// interface LoadViewsParams {
//   model: string;
//   views: [ViewId, ViewType][];
//   context: Context;
// }

// interface LoadViewsOptions {
//   actionId?: number;
//   withActionMenus?: boolean;
//   withFilters?: boolean;
// }

// interface ViewManager {
//   loadViews(params: LoadViewsParams, options: LoadViewsOptions): Promise<ViewDescriptions>;
// }

export const viewService = {
  name: "view",
  dependencies: ["model"],
  deploy(env) {
    const modelService = env.services.model;
    const cache = {};
    /**
     * Loads various information concerning views: fields_view for each view,
     * fields of the corresponding model, and optionally the filters.
     *
     * @param {params} LoadViewsParams
     * @param {options} LoadViewsOptions
     * @returns {Promise<ViewDescriptions>}
     */
    async function loadViews(params, options) {
      const key = JSON.stringify([params.model, params.views, params.context, options]);
      if (!cache[key]) {
        const result = await modelService(params.model).call("load_views", [], {
          views: params.views,
          options: {
            action_id: options.actionId || false,
            load_filters: options.withFilters || false,
            toolbar: options.withActionMenus || false,
          },
          context: params.context,
        });
        const viewDescriptions = result; // for legacy purpose, keys in result are left in viewDescriptions

        for (const [_, viewType] of params.views) {
          const viewDescription = result.fields_views[viewType];
          viewDescription.fields = Object.assign({}, result.fields, viewDescription.fields); // before a deep freeze was done.
          if (viewType === "search" && options.withFilters) {
            viewDescription.irFilters = result.filters;
          }
          viewDescriptions[viewType] = viewDescription;
        }

        cache[key] = viewDescriptions;
      }
      return cache[key];
    }
    return { loadViews };
  },
};

serviceRegistry.add("view", viewService);
