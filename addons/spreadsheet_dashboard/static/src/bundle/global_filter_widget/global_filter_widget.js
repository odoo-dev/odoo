import { Component, useEffect, useState } from "@odoo/owl";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import {
    getEmptyFilterValue,
    getFacetInfo,
    isEmptyFilterValue,
} from "@spreadsheet/global_filters/helpers";
import { useService } from "@web/core/utils/hooks";
import { FilterValuesList } from "../dashboard_action/filter_values_list/filter_values_list";
import {
    deserializeFavoriteFilters,
    serializeFavoriteFilters,
} from "../dashboard_action/dashboard_search_model";
import { useRecordObserver } from "@web/model/relational_model/utils";

export class GlobalFilterWidget extends Component {
    static template = "spreadsheet.GlobalFilterWidget";
    static components = { FilterValuesList };
    static props = {
        ...standardFieldProps,
        dashboard: { type: String, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.loader = useService("spreadsheet_dashboard_loader");
        this.state = useState({
            folded: true,
            dashboard: null,
            facets: [],
            filtersAndValues: [],
            searchableParentRelations: {},
            isLoading: false,
        });
        this._lastGlobalFilters = null;

        useRecordObserver(async (record, nextProps) => {
            const dashboardId = this.resolveDashboardId(nextProps);
            const globalFiltersChanged = record.data.global_filters !== this._lastGlobalFilters;
            if (globalFiltersChanged) {
                this._lastGlobalFilters = record.data.global_filters;
                await this.loadDashboardContext(dashboardId);
            }
        });

        useEffect(
            () => {
                this._reloadDashboardContext();
            },
            () => [this.resolveDashboardId()]
        );
    }

    async _reloadDashboardContext() {
        const dashboardId = this.resolveDashboardId();
        this.state.folded = true;
        await this.loadDashboardContext(dashboardId);
    }

    resolveDashboardId(props = this.props) {
        const { dashboard, record } = props;
        if (!dashboard) {
            return null;
        }
        if (record?.fieldNames?.includes(dashboard)) {
            return record.data[dashboard]?.id || null;
        }
        return dashboard;
    }

    async loadDashboard(dashboardId) {
        const dashboard = this.loader.getDashboard(dashboardId);
        if (dashboard.promise) {
            await dashboard.promise;
        }
        return dashboard;
    }

    async loadDashboardContext(dashboardId) {
        this.state.isLoading = true;
        try {
            const dashboard = await this.loadDashboard(dashboardId);
            this.state.dashboard = dashboard;

            const filtersAndValues = deserializeFavoriteFilters(
                dashboard.model.getters,
                this.props.record.data.global_filters || {}
            );

            this.state.filtersAndValues = filtersAndValues;
            this.state.facets = await this._buildFacets(filtersAndValues, dashboard);
            this.state.searchableParentRelations = await this.fetchSearchableParentRelation(
                dashboard
            );
        } finally {
            this.state.isLoading = false;
        }
    }

    _normalizeFilterValue(node, value) {
        if (value !== undefined || !node.value?.operator) {
            return value;
        }
        const emptyValue = getEmptyFilterValue(node.globalFilter, node.value.operator);
        return typeof emptyValue === "object"
            ? { ...emptyValue, operator: node.value.operator }
            : emptyValue;
    }

    async _buildFacets(filtersAndValues, dashboard) {
        const facets = [];
        for (const { globalFilter, value } of filtersAndValues) {
            if (isEmptyFilterValue(globalFilter, value)) {
                continue;
            }
            const info = await getFacetInfo(this.env, globalFilter, value, dashboard.model.getters);
            facets.push(info);
        }
        return facets;
    }

    async onFilterChange(filterId, value) {
        const node = this.state.filtersAndValues.find((f) => f.globalFilter.id === filterId);
        if (!node) {
            return;
        }
        node.value = this._normalizeFilterValue(node, value);
        const global_filters = serializeFavoriteFilters(this.state.filtersAndValues);
        await this.props.record.update({ global_filters });
    }

    async fetchSearchableParentRelation() {
        const models = this.state.dashboard.model.getters
            .getGlobalFilters()
            .filter((f) => f.type === "relation")
            .map((f) => f.modelName);
        return this.orm
            .cache({ type: "disk" })
            .call("ir.model", "has_searchable_parent_relation", [models]);
    }
}
