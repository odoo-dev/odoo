import { Component, onWillStart, useState } from "@odoo/owl";
import { FilterValue } from "@spreadsheet/global_filters/components/filter_value/filter_value";
import { _t } from "@web/core/l10n/translation";
import { getOperatorLabel } from "@web/core/tree_editor/tree_editor_operator_editor";
import {
    getDefaultValue,
    getEmptyFilterValue,
    getFilterTypeOperators,
    isEmptyFilterValue,
} from "@spreadsheet/global_filters/helpers";
import { useService } from "@web/core/utils/hooks";
import { deepEqual } from "@web/core/utils/objects";
import { FACET_ICONS } from "@web/search/utils/misc";
import { DashboardCustomFavoriteItem } from "./dashboard_custom_favorite_item";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { CheckboxItem } from "@web/core/dropdown/checkbox_item";

/**
 * This component is used to display a list of all the global filters of a dashboard.
 * It allows the user to select the values of the filters and confirm or discard the changes.
 */
export class DashboardSearchBarMenu extends Component {
    static template = "spreadsheet_dashboard.DashboardSearchBarMenu";
    static components = {
        CheckboxItem,
        DashboardCustomFavoriteItem,
        DropdownItem,
        FilterValue,
    };

    static props = {
        close: Function,
        model: Object,
    };

    setup() {
        this.orm = useService("orm");
        this.facet_icons = FACET_ICONS;
        this.actionService = useService("action");
        this.loader = useService("spreadsheet_dashboard_loader");
        this.searchModel = this.loader.getDashboard(this.loader.activeDashboardId).searchModel;
        this.sharedFavoritesExpanded = useState({ value: false });
        this.state = useState({
            filtersAndValues: this.globalFilters.map((globalFilter) => {
                const value = this.props.model.getters.getGlobalFilterValue(globalFilter.id);
                return {
                    globalFilter,
                    value: value ? { ...value } : getDefaultValue(globalFilter.type),
                };
            }),
        });
        onWillStart(async () => {
            this.searchableParentRelations = await this.fetchSearchableParentRelation();
        });
    }

    get globalFilters() {
        return this.props.model.getters.getGlobalFilters();
    }

    get favorites() {
        return this.searchModel.getFavoriteList((item) => item.userIds.length === 1);
    }

    get sharedFavorites() {
        const sharedFavorites = this.searchModel.getFavoriteList(
            (item) => item.userIds.length !== 1
        );

        if (sharedFavorites.length <= 4 || this.sharedFavoritesExpanded.value) {
            this.sharedFavoritesExpanded.value = true;
        } else {
            sharedFavorites.length = 3;
        }
        return sharedFavorites;
    }

    setGlobalFilterValue(node, value) {
        if (value == undefined && node.globalFilter.type !== "date") {
            // preserve the operator.
            node.value = {
                ...node.value,
                ...getEmptyFilterValue(node.globalFilter, node.value.operator),
            };
        } else {
            node.value = value;
        }
    }

    getTranslatedFilterLabel(filter) {
        return _t(filter.label); // Label is extracted from the spreadsheet json file
    }

    getOperators(filter) {
        const operators = getFilterTypeOperators(filter.type);
        if (filter.type === "relation" && !this.searchableParentRelations[filter.modelName]) {
            return operators.filter((op) => op !== "child_of");
        }
        return filter.type === "boolean" ? [undefined, ...operators] : operators;
    }

    filterHasClearButton(node) {
        return !isEmptyFilterValue(node.globalFilter, node.value);
    }

    getOperatorLabel(operator) {
        return operator ? getOperatorLabel(operator) : "";
    }

    updateOperator(node, operator) {
        if (!operator) {
            node.value = undefined;
            return;
        }
        if (!node.value) {
            node.value = {};
        }
        node.value.operator = operator;
        const defaultValue = getEmptyFilterValue(node.globalFilter, operator);
        for (const key of Object.keys(defaultValue ?? {})) {
            if (!(key in node.value)) {
                node.value[key] = defaultValue[key];
            }
        }
    }

    clearFilter(filterId) {
        const node = this.state.filtersAndValues.find((node) => node.globalFilter.id === filterId);
        if (node && node.value) {
            const emptyValue = getEmptyFilterValue(node.globalFilter, node.value.operator);
            node.value =
                typeof emptyValue === "object"
                    ? { ...emptyValue, operator: node.value.operator }
                    : emptyValue;
        }
    }

    onFavoriteSelected(itemId) {
        this.state.filtersAndValues = this.searchModel.toggleFavorite(itemId);
    }

    onConfirm() {
        for (const node of this.state.filtersAndValues) {
            const { globalFilter, value } = node;
            const originalValue = this.props.model.getters.getGlobalFilterValue(globalFilter.id);

            if (deepEqual(originalValue, value)) {
                continue;
            }
            this.props.model.dispatch("SET_GLOBAL_FILTER_VALUE", {
                id: globalFilter.id,
                value: isEmptyFilterValue(globalFilter, value) ? undefined : value,
            });
        }
        this.props.close();
        this.searchModel.handleManualFilterConfirm(this.state.filtersAndValues);
    }

    onDiscard() {
        this.props.close();
    }

    editFavorite(itemId) {
        this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: "spreadsheet.dashboard.favorite.filters",
            views: [[false, "form"]],
            context: {
                form_view_ref:
                    "spreadsheet_dashboard.spreadsheet_dashboard_favorite_filters_view_edit_form",
            },
            res_id: itemId,
        });
    }

    fetchSearchableParentRelation() {
        const models = this.globalFilters
            .filter((filter) => filter.type === "relation")
            .map((filter) => filter.modelName);
        return this.orm
            .cache({ type: "disk" })
            .call("ir.model", "has_searchable_parent_relation", [models]);
    }
}
