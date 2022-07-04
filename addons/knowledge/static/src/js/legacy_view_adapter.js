/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { ViewAdapter } from "@web/legacy/action_adapters";
import { getDefaultConfig } from "@web/views/view";
import legacyViewRegistry from "web.view_registry";
import Widget from "web.Widget";

const {
    Component,
    onWillStart,
    useSubEnv,
    useState,
    xml
} = owl;

const viewRegistry = registry.category("views");
const viewKeysMapping = {
    action: "action",
    actionMenus: "actionMenus",
    arch: "arch",
    context: "context",
    currentId: "resId",
    domain: "domain",
    fields: "fields",
    groupBy: "groupBy",
    modelName: "resModel",
    orderBy: "orderBy",
    viewId: "viewId",
    withControlPanel: "withControlPanel",
    withSearchPanel: "withSearchPanel",
};

export class View extends Component {
    setup() {
        const { arch, fields, resModel, searchViewArch, searchViewFields, type } = this.props;

        if (!resModel) {
            throw Error(`View props should have a "resModel" key`);
        }
        if (!type) {
            throw Error(`View props should have a "type" key`);
        }
        if ((arch && !fields) || (!arch && fields)) {
            throw new Error(`"arch" and "fields" props must be given together`);
        }
        if ((searchViewArch && !searchViewFields) || (!searchViewArch && searchViewFields)) {
            throw new Error(`"searchViewArch" and "searchViewFields" props must be given together`);
        }

        // Ugly hack to ensure the environment is the correct one
        const { bus, services } = odoo.__WOWL_DEBUG__.root.env;
        useSubEnv({
            bus,
            config: {
                ...getDefaultConfig(),
                ...this.env.config,
            },
            services,
        });

        this.viewService = useService("view");
        this.Widget = Widget; // fool the ComponentAdapter with a simple Widget
        this.state = useState({
            error: false
        });

        onWillStart(this.onWillStart);
    }

    async onWillStart() {
        const {
            actionId,
            actionMenus,
            arch,
            context,
            fields,
            irFilters,
            loadActionMenus,
            loadIrFilters,
            resModel,
            searchViewArch,
            searchViewFields,
        } = this.props;
        let { searchViewId, type, viewId } = this.props;

        this.views = this.props.views.slice();

        const view = this.views.find((v) => v[1] === type);
        if (view) {
            view[0] = viewId ? viewId : view[0];
            viewId = view[0];
        } else {
            this.views.push([viewId || false, type]); // viewId will remain undefined if not specified and loadView=false
        }

        const searchView = this.views.find((v) => v[1] === "search");
        if (searchView) {
            searchView[0] = searchViewId ? searchViewId : searchView[0];
            searchViewId = searchView[0];
        } else if (searchViewId) {
            this.views.push([searchViewId, "search"]);
        }
        // prepare view description

        const loadView = !arch || !fields || (!actionMenus && loadActionMenus);
        const loadSearchView =
            searchViewId && (!searchViewArch || !searchViewFields || (!irFilters && loadIrFilters));

        if (loadView || loadSearchView) {
            let viewDescriptions = null;
            try {
                viewDescriptions = await this.viewService.loadViews({
                    resModel,
                    views: this.views,
                    context,
                }, { actionId, loadActionMenus, loadIrFilters });
            } catch (error) {
                console.log(error);
                if (error.name === 'odoo.exceptions.AccessError') {
                    this.state.error = 'access';
                } else {
                    this.state.error = 'other';
                }
                return;
            }
            const result = viewDescriptions.__legacy__;
            this.viewParams = result.fields_views[type];
            if (result.fields_views.search) {
                this.viewParams.controlPanelFieldsView = {
                    ...result.fields_views.search,
                    favoriteFilters: result.filters,
                    fields: result.fields,
                    viewFields: result.fields_views.search.fields,
                };
            }
        } else {
            this.viewParams = { modelName: resModel, type };
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(this.viewParams.arch, "text/xml");
        const rootNode = doc.documentElement;
        const rootAttrs = {};
        for (const attrName of rootNode.getAttributeNames()) {
            rootAttrs[attrName] = rootNode.getAttribute(attrName);
        }

        this.View = legacyViewRegistry.get(rootAttrs.js_class || type);
        this.fields = JSON.parse(JSON.stringify(this.viewParams.fields));
        this.viewInfo = {
            arch: this.viewParams.arch,
            fields: this.fields,
            views: this.views,
        };
        if (this.viewParams.viewId) {
            this.viewInfo.viewId = this.viewParams.viewId;
        }
        if (this.viewParams.actionMenus) {
            this.viewInfo.actionMenus = this.viewParams.actionMenus;
        }
    }

    getViewParams() {
        const viewParams = { ...this.viewParams };
        for (const key in viewKeysMapping) {
            const newKey = viewKeysMapping[key];
            if (newKey in this.props) {
                viewParams[key] = this.props[newKey];
            }
        }
        delete viewParams.model;
        const action = this.props.action ? { ...this.props.action } : {};
        viewParams.action = {
            ...action,
            actionId: this.props.actionId || action.id || false,
            fields: this.fields,
            views: this.views
                .filter(([, type]) => type !== "search")
                .map(([, type]) => viewRegistry.get(type)),
            _views: this.views,
        };
        return viewParams;
    }
}

View.components = { ViewAdapter };
View.template = xml/* xml */ `
    <t t-if="this.state.error">
        <t t-if="this.state.error === 'access'">
            <i class="fa fa-warning"/>You don't have access to the <span t-out="this.props.resModel" class="font-italic"/> model.
        </t>
        <t t-else="">
            <i class="fa fa-warning"/>Error while loading the view.
        </t>
    </t>
    <ViewAdapter
        t-else=""
        Component="Widget"
        View="View"
        viewInfo="viewInfo"
        viewParams="getViewParams()"
        onPushState="props.onPushState"
        selectRecord="props.selectRecord"
    />
`;

View.defaultProps = {
    action: {},
    actionId: false,
    display: {},
    context: {},
    loadIrFilters: false,
    views: [],
};
