/** @odoo-module **/

import { CallbackRecorder, useSetupAction } from "@web/webclient/actions/action_hook";
import { SearchModel } from "../search_model";
import { useModel } from "@web/core/model";

const { Component, hooks } = owl;
const { useSubEnv } = hooks;

const searchModelStateSymbol = Symbol("searchModelState");

export const SEARCH_KEYS = ["context", "domain", "domains", "groupBy", "orderBy"];
export const WITH_SEARCH_KEYS = [
    ...SEARCH_KEYS,
    "irFilters",
    "searchViewArch",
    "searchViewFields",
    "searchViewId",
    "__saveParams__",
];

export class WithSearch extends Component {
    setup() {
        this.Component = this.props.Component;

        this.keys = WITH_SEARCH_KEYS;
        if (this.Component.props) {
            // we assume that this.Component.props won't vary
            this.keys = this.keys.filter((key) => key in this.Component.props);
        }

        this.searchModel = useModel({
            Model: this.Component.SearchModel || this.constructor.SearchModel,
        });

        useSubEnv({
            searchModel: this.searchModel,
        });

        useSetupAction({
            exportSearchState: () => {
                return {
                    [searchModelStateSymbol]: this.searchModel.exportState(),
                };
            },
        });
    }

    async willStart() {
        const config = Object.assign({}, this.props);
        if (config.searchState && config.searchState[searchModelStateSymbol]) {
            config.state = config.searchState[searchModelStateSymbol];
            delete config.searchState;
        }
        await this.searchModel.load(config);
    }

    async willUpdateProps(nextProps) {
        const config = {};
        for (const key of SEARCH_KEYS) {
            if (nextProps[key]) {
                config[key] = nextProps[key];
            }
        }
        await this.searchModel.reload(config);
    }

    get componentProps() {
        const componentProps = Object.assign({}, this.props.componentProps);
        for (const key of this.keys) {
            if (this.searchModel[key] !== undefined) {
                componentProps[key] = this.searchModel[key];
            }
        }
        return componentProps;
    }

    get withSearchPanel() {
        /** @todo review when working on search panel */
        return this.searchModel.loadSearchPanel;
    }
}

WithSearch.defaultProps = {
    componentProps: {},
};
WithSearch.props = {
    Component: Function,
    componentProps: { type: Object, optional: 1 },

    modelName: String,

    actionId: { type: [Number, false], optional: 1 },
    displayName: { type: String, optional: 1 },

    // state
    __exportSearchState__: { type: CallbackRecorder, optional: 1 },
    searchState: { type: Object, optional: 1 },

    /** @todo should we not unify __saveParams__ and __exportState__? */
    __saveParams__: { type: CallbackRecorder, optional: 1 },

    // search query elements
    context: { type: Object, optional: 1 },
    domain: { type: Array, element: [String, Array], optional: 1 },
    domains: { type: Array, element: Object, optional: 1 },
    groupBy: { type: Array, element: String, optional: 1 },
    orderBy: { type: Array, element: String, optional: 1 },

    // search view description
    searchViewArch: { type: String, optional: 1 },
    searchViewFields: { type: Object, optional: 1 },
    searchViewId: { type: [Number, false], optional: 1 },

    irFilters: { type: Array, element: Object, optional: 1 },
    loadIrFilters: { type: Boolean, optional: 1 },

    // extra options
    activateFavorite: { type: Boolean, optional: 1 },
    dynamicFilters: { type: Array, element: Object, optional: 1 },
    loadSearchPanel: { type: Boolean, optional: 1 },
    searchMenuTypes: { type: Array, element: String, optional: 1 },
};
WithSearch.template = "web.WithSearch";

WithSearch.SearchModel = SearchModel;
