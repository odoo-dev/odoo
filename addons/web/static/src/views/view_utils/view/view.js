/** @odoo-module **/

import { evaluateExpr } from "@web/core/py_js/py";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/service_hook";
import { WithSearch, WITH_SEARCH_KEYS } from "@web/search/with_search/with_search";

const viewRegistry = registry.category("views");

const { Component, QWeb } = owl;

export class View extends Component {
    setup() {
        if (!("modelName" in this.props)) {
            throw Error(`View props should have a "modelName" key`);
        }
        if (!("type" in this.props)) {
            throw Error(`View props should have a "type" key`);
        }

        this._viewService = useService("view");

        this.withSearchProps = null;
    }

    async willStart() {
        // determine view type
        let ViewClass = viewRegistry.get(this.props.type);
        const type = ViewClass.type;

        // determine views for which descriptions should be obtained
        let { views, viewId, searchViewId } = this.props;

        views = JSON.parse(JSON.stringify(views));

        const view = views.find((v) => v[1] === type);
        if (view) {
            view[0] = viewId !== undefined ? viewId : view[0];
            viewId = view[0];
        } else {
            views.push([viewId || false, type]); // viewId will remain undefined if not specified and loadView=false
        }

        const searchView = views.find((v) => v[1] === "search");
        if (searchView) {
            searchView[0] = searchViewId !== undefined ? searchViewId : searchView[0];
            searchViewId = searchView[0];
        } else if (searchViewId !== undefined) {
            views.push([searchViewId, "search"]);
        }
        // searchViewId will remains undefined if loadSearchView=false

        // prepare view description
        const { actionId, context, modelName, loadActionMenus, loadIrFilters } = this.props;
        let viewDescription = { modelName, type };
        let searchViewDescription;
        let { arch, fields, searchViewArch, searchViewFields, irFilters, actionMenus } = this.props;

        let loadView = !arch || !fields || (!actionMenus && loadActionMenus);
        let loadSearchView =
            searchViewId !== undefined &&
            (!searchViewArch || !searchViewFields || (!irFilters && loadIrFilters));

        if (loadView || loadSearchView) {
            // view description (or search view description if required) is incomplete
            // a loadViews is done to complete the missing information
            const viewDescriptions = await this._viewService.loadViews(
                { context, model: modelName, views },
                { actionId, loadActionMenus, loadIrFilters }
            );
            // Note: if this.props.views is different from views, the cached descriptions
            // will certainly not be reused! (but for the standard flow this will work as
            // before)
            viewDescription = viewDescriptions[type];
            searchViewDescription = viewDescriptions.search;
            if (loadSearchView) {
                if (!searchViewArch) {
                    searchViewArch = searchViewDescription.arch;
                }
                if (!searchViewFields) {
                    searchViewFields = searchViewDescription.fields;
                }
                if (!irFilters) {
                    irFilters = searchViewDescription.irFilters;
                }
            }
        }

        if (arch) {
            viewDescription.arch = arch;
        }
        if (fields) {
            viewDescription.fields = fields;
        }
        if (actionMenus) {
            // good name for prop?
            viewDescription.actionMenus = actionMenus;
        }

        const parser = new DOMParser();
        const xml = parser.parseFromString(viewDescription.arch, "text/xml");
        const rootNode = xml.documentElement;
        const rootAttrs = {};
        for (const attrName of rootNode.getAttributeNames()) {
            rootAttrs[attrName] = rootNode.getAttribute(attrName);
        }

        //////////////////////////////////////////////////////////////////
        /** @todo take care of banner_route rootAttribute*/
        //////////////////////////////////////////////////////////////////

        // determine ViewClass to instantiate (if not already done)

        if (rootAttrs.js_class) {
            ViewClass = viewRegistry.get(rootAttrs.js_class);
        }

        // prepare the view props
        let viewProps = {};
        for (const key in this.props) {
            // some keys are managed by WithSearch component
            if (![...WITH_SEARCH_KEYS].includes(key)) {
                viewProps[key] = this.props[key];
            }
        }

        viewProps.views = views;

        let { noContentHelp } = viewProps;
        if (noContentHelp !== undefined) {
            const htmlHelp = document.createElement("div");
            htmlHelp.innerHTML = noContentHelp;
            if (!htmlHelp.innerText.trim()) {
                delete viewProps.noContentHelp;
            }
        }

        if (rootAttrs.sample) {
            viewProps.useSampleModel = Boolean(evaluateExpr(rootAttrs.sample));
        }

        viewProps.arch = viewDescription.arch;
        viewProps.fields = viewDescription.fields;
        if (viewDescription.viewId !== undefined) {
            viewProps.viewId = viewDescription.viewId;
        }
        if (viewDescription.actionMenus) {
            viewProps.actionMenus = viewDescription.actionMenus;
        }

        if (ViewClass.props) {
            for (const key in viewProps) {
                if (!(key in ViewClass.props)) {
                    delete viewProps[key];
                }
            }
        }

        // prepare the WithSearh component props
        this.withSearchProps = {};
        for (const key in this.props) {
            this.withSearchProps[key] = this.props[key];
        }

        Object.assign(this.withSearchProps, {
            Component: ViewClass,
            componentProps: viewProps,
        });

        if (searchViewId !== undefined) {
            this.withSearchProps.searchViewId = searchViewId;
        }
        if (searchViewArch) {
            this.withSearchProps.searchViewArch = searchViewArch;
        }
        if (searchViewFields) {
            this.withSearchProps.searchViewFields = searchViewFields;
        }
        if (irFilters) {
            this.withSearchProps.irFilters = irFilters;
        }

        if (!this.withSearchProps.searchMenuTypes) {
            this.withSearchProps.searchMenuTypes =
                ViewClass.searchMenuTypes || this.constructor.searchMenuTypes;
        }

        //////////////////////////////////////////////////////////////////
        /** @todo prepare loadSearchPanel WithSearch prop (depends on view
         * types on searchpanel tag in search arch)                     */
        //////////////////////////////////////////////////////////////////

        if (searchViewArch) {
            // determine loadSearchPanel here and display
            // const DEFAULT_VIEW_TYPES = ["kanban", "list"];
            // if (node.hasAttribute("view_types")) {
            //   data.viewTypes.push(...node.getAttribute("view_types").split(","));
            // } else {
            //   data.viewTypes.push(...DEFAULT_VIEW_TYPES);
            // }
        }

        for (const key in this.withSearchProps) {
            if (!(key in WithSearch.props)) {
                delete this.withSearchProps[key];
            }
        }
    }

    async willUpdateProps(nextProps) {
        // we assume that nextProps can only vary in the search keys:
        // context, domain, domains, groupBy, orderBy
        const { context, domain, domains, groupBy, orderBy } = nextProps;
        Object.assign(this.withSearchProps, { context, domain, domains, groupBy, orderBy });
    }
}

View.template = "web.View";
View.components = { WithSearch };
View.defaultProps = {
    actionId: false,
    display: {},
    context: {},
    loadActionMenus: false,
    loadIrFilters: false,
    views: [],
    useSampleModel: false,
};

View.searchMenuTypes = ["filter", "groupBy", "favorite"];

QWeb.registerComponent("View", View);
