import { Component, useState } from "@odoo/owl";
import {
    getDefaultValue,
    getEmptyFilterValue,
    getFilterTypeOperators,
    isEmptyFilterValue,
} from "@spreadsheet/global_filters/helpers";
import { getOperatorLabel } from "@web/core/tree_editor/tree_editor_operator_editor";
import { FilterValue } from "@spreadsheet/global_filters/components/filter_value/filter_value";

export class FilterContainer extends Component {
    static template = "spreadsheet.FilterContainer";
    static components = { FilterValue };
    static props = {
        filter: { type: Object },
        model: { type: Object },
        updateFilterValue: { type: Function },
        defaultValue: { type: Object, optional: true },
        isLayoutHorizontal: { type: Boolean, optional: true },
        onOpenEditor: { type: Function, optional: true },
        searchableParentRelations: { type: Object, optional: true },
    };

    setup() {
        this.model = this.props.model;
        this.state = useState({ value: this.props.defaultValue || this.initialValue });
    }

    get initialValue() {
        const value = this.model.getters.getGlobalFilterValue(this.props.filter.id);
        return value ? { ...value } : getDefaultValue(this.props.filter.type);
    }

    get operators() {
        const { filter, searchableParentRelations } = this.props;
        let operators = getFilterTypeOperators(filter.type);
        if (filter.type === "relation" && !searchableParentRelations?.[filter.modelName]) {
            operators = operators.filter((op) => op !== "child_of");
        }
        return filter.type === "boolean" ? [undefined, ...operators] : operators;
    }

    get hasClearButton() {
        return !isEmptyFilterValue(this.props.filter, this.state.value);
    }

    getOperatorLabel(operator) {
        return operator ? getOperatorLabel(operator) : "";
    }

    _syncValue() {
        const { filter } = this.props;
        const normalized = isEmptyFilterValue(filter, this.state.value)
            ? undefined
            : this.state.value;
        this.props.updateFilterValue(normalized);
    }

    updateOperator(operator) {
        if (!operator) {
            this.state.value = undefined;
            this._syncValue();
            return;
        }
        const previousValue = this.state.value || {};
        const defaultValue = getEmptyFilterValue(this.props.filter, operator) || {};
        this.state.value = {
            ...defaultValue,
            ...previousValue,
            operator,
        };
        this._syncValue();
    }

    clearFilter() {
        const value = this.state.value;
        if (!value) {
            return;
        }
        const emptyValue = getEmptyFilterValue(this.props.filter, value.operator);
        this.state.value =
            typeof emptyValue === "object"
                ? { ...emptyValue, operator: value.operator }
                : emptyValue;
        this._syncValue();
    }

    setGlobalFilterValue(value) {
        if (value === undefined && this.props.filter.type !== "date") {
            // preserve operator
            this.state.value = {
                ...this.state.value,
                ...getEmptyFilterValue(this.props.filter, this.state.value?.operator),
            };
        } else {
            this.state.value = value;
        }
        this._syncValue();
    }

    getFilterIcon(type) {
        return (
            {
                date: "fa-calendar",
                relation: "fa-link",
                text: "fa-font",
                boolean: "fa-toggle-off",
                selection: "fa-caret-down",
                numeric: "fa-hashtag",
            }[type] || "fa-filter"
        );
    }
}
