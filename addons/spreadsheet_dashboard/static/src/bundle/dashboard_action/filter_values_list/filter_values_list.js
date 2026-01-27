import { Component } from "@odoo/owl";
import { FilterValue } from "@spreadsheet/global_filters/components/filter_value/filter_value";
import { _t } from "@web/core/l10n/translation";
import { getOperatorLabel } from "@web/core/tree_editor/tree_editor_operator_editor";
import { getEmptyFilterValue, getFilterTypeOperators } from "@spreadsheet/global_filters/helpers";
import { isEmptyFilterValue } from "../../../../../../spreadsheet/static/src/global_filters/helpers";

/**
 * This component is used to display a list of all the global filters of a dashboard.
 * It allows the user to select the values of the filters and confirm or discard the changes.
 */
export class FilterValuesList extends Component {
    static template = "spreadsheet.FilterValuesList";
    static components = { FilterValue };

    static props = {
        items: Array,
        searchableParentRelations: Object,
        onFilterChange: Function,
        model: Object,
    };

    getTranslatedFilterLabel(filter) {
        return _t(filter.label);
    }

    getOperators(filter) {
        const operators = getFilterTypeOperators(filter.type);
        if (filter.type === "relation" && !this.props.searchableParentRelations[filter.modelName]) {
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
            this.props.onFilterChange(node.globalFilter.id, undefined);
            return;
        }

        const previousValue = node.value || {};
        const defaultValue = getEmptyFilterValue(node.globalFilter, operator) || {};
        this.props.onFilterChange(node.globalFilter.id, {
            ...defaultValue,
            ...previousValue,
            operator,
        });
    }

    updateValue(node, value) {
        this.props.onFilterChange(node.globalFilter.id, value);
    }

    clearFilter(node) {
        this.props.onFilterChange(node.globalFilter.id, undefined);
    }
}
