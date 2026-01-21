/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import {
    getDefaultValue,
    getFacetInfo,
    isEmptyFilterValue,
} from "@spreadsheet/global_filters/helpers";
import { useService } from "@web/core/utils/hooks";
import { FilterContainer } from "@spreadsheet/global_filters/components/filter_container/filter_container";

export class GlobalFilterField extends Component {
    static template = "spreadsheet.GlobalFilterField";
    static components = { FilterContainer };
    static props = {
        ...standardFieldProps,
        dashboard: { type: String, optional: true },
    };

    setup() {
        this.loader = useService("spreadsheet_dashboard_loader");
        this.state = useState({
            folded: true,
            facets: [],
            filtersAndValues: [],
            dashboard: null,
            isLoading: false,
        });

        onWillStart(async () => {
            const dashboardId = this.getDashboardId();
            if (dashboardId) {
                await this.loadDashboard(dashboardId);
            }
        });
    }

    getDashboardId(props = this.props) {
        let dashboardId = props.dashboard;
        if (!dashboardId) {
            return null;
        }
        if (props.record?.fieldNames?.includes(dashboardId)) {
            dashboardId = props.record.data[dashboardId]?.id;
        }
        return dashboardId || null;
    }

    serializeFavoriteFilters(filterNodes) {
        const serialized = {};
        for (const { globalFilter, value } of filterNodes) {
            if (!isEmptyFilterValue(globalFilter, value)) {
                serialized[globalFilter.id] = value;
            }
        }
        return serialized;
    }

    deserializeFavoriteFilters(getters, serializedFilters) {
        return getters.getGlobalFilters().map((gf) => ({
            globalFilter: gf,
            value: serializedFilters[gf.id]
                ? { ...serializedFilters[gf.id] }
                : getDefaultValue(gf.type),
        }));
    }

    async loadDashboard(dashboardId) {
        this.state.isLoading = true;
        try {
            const dashboard = this.loader.getDashboard(dashboardId);
            if (dashboard.promise) {
                await dashboard.promise;
            }

            this.state.dashboard = dashboard;

            const filtersAndValues = this.deserializeFavoriteFilters(
                dashboard.model.getters,
                this.props.record.data.global_filters || {}
            );

            this.state.filtersAndValues = filtersAndValues;
            this.state.facets = await this.computeFacets(filtersAndValues, dashboard);
        } finally {
            this.state.isLoading = false;
        }
    }

    async computeFacets(filtersAndValues, dashboard) {
        const facets = [];

        for (const item of filtersAndValues) {
            if (isEmptyFilterValue(item.globalFilter, item.value)) {
                continue;
            }

            const info = await getFacetInfo(
                this.env,
                item.globalFilter,
                item.value,
                dashboard.model.getters
            );

            facets.push({
                id: info.id,
                title: info.title,
                values: info.values,
                operator: info.operator,
                separator: info.separator,
            });
        }

        return facets;
    }

    async updateFilterValue(filterId, value) {
        const filtersAndValues = this.state.filtersAndValues.map((node) =>
            node.globalFilter.id === filterId ? { ...node, value } : node
        );

        const global_filters = this.serializeFavoriteFilters(filtersAndValues);

        // ✅ WORKS EXACTLY LIKE BEFORE
        await this.props.record.update({ global_filters });

        if (this.state.dashboard) {
            this.state.filtersAndValues = filtersAndValues;
            this.state.facets = await this.computeFacets(filtersAndValues, this.state.dashboard);
        }
    }
}
