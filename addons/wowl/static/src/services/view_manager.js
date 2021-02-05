/** @odoo-module **/
import { sortBy } from "../utils/arrays";
import { processSearchViewDescription } from "../views/view_utils/search_utils";
export const viewManagerService = {
  name: "view_manager",
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
        // would it not be better to have views in the form { list: 1, graph, 4, ...} and transform it here?

        const result = await modelService(params.model).call("load_views", [], {
          views: params.views,
          options: {
            action_id: options.actionId || false,
            load_filters: options.withFilters || false,
            toolbar: options.withActionMenus || false,
          },
          context: params.context,
        });
        const viewDescriptions = result // for legacy purpose, keys in result are left in viewDescriptions
        // we process search info first if any
        const views = sortBy(params.views, (v) => (v[1] === "search" ? 0 : 1));
        for (const [_, viewType] of views) {
          const viewDescription = result.fields_views[viewType];
          viewDescription.fields = JSON.parse(
            JSON.stringify(Object.assign(result.fields, viewDescription.fields))
          );

          if (viewType === "search") {
            if (options.withFilters) {
              viewDescription.irFilters = result.filters;
            }
            const searchDefaults = {};
            for (const key in params.context) {
              const match = /^search_default_(.*)$/.exec(key);
              if (match) {
                const val = params.context[key];
                if (val) {
                  searchDefaults[match[1]] = val;
                }
              }
            }
            viewDescriptions.search = await processSearchViewDescription(
              viewDescription,
              modelService,
              searchDefaults
            );
          } else {
            if (viewType === "list") {
              viewDescription.type = viewType // replace tree by list in view description.
            }

            let View;
            let viewProps;

            const parser = new DOMParser();
            const xml = parser.parseFromString(viewDescription.arch, "text/xml");
            const rootNode = xml.documentElement;
            let processArch;
            if (rootNode.hasAttribute("js_class")) {
              const jsViewType = rootNode.getAttribute("js_class");
              View = odoo.viewRegistry.get(jsViewType);
              processArch = View.processArch || odoo.viewRegistry.get(viewType).processArch;
            } else {
              View = odoo.viewRegistry.get(viewType);
              processArch = View.processArch;
            }

            if (processArch) {
              viewProps = processArch(viewDescription);
            } else {
              viewProps = viewDescription;
            }
            if ("search" in viewDescriptions) {
              viewProps.processedSearchViewDescription = viewDescriptions.search;
            }
            if (View.props) {
              for (const key in viewProps) {
                if (!(key in View.props)) {
                  delete viewProps[key];
                }
              }
            }
            viewDescriptions[viewType] = { View, viewProps };
          }
        }
        cache[key] = viewDescriptions;
      }
      return cache[key]; // FIXME: clarify the API --> already better but ...
    }
    return { loadViews };
  },
};
