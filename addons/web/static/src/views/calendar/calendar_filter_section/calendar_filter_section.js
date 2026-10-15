import { render } from "@web/owl2/utils";
import { _t } from "@web/core/l10n/translation";
import { Transition } from "@web/core/transition";
import { Record } from "@web/model/record";
import { Field } from "@web/views/fields/field";
import { getColor } from "../utils";
import { Component, proxy, t, useProps } from "@odoo/owl";

let nextId = 1;

export class CalendarFilterSection extends Component {
    static components = {
        Field,
        Record,
        Transition,
    };
    static template = "web.CalendarFilterSection";
    static subTemplates = {
        filter: "web.CalendarFilterSection.filter",
    };
    props = useProps({
        model: t.object(),
        section: t.object(),
        placeholder: t.string().optional(),
    });

    setup() {
        this.state = proxy({
            collapsed: false,
        });
    }

    /**
     * The section is displayed through the widget of the field (e.g. to search
     * the employees the user has access to), in a record that is never saved:
     * the selected records are turned into filters instead.
     */
    get recordProps() {
        const { fieldName } = this.section;
        const field = this.props.model.fields[fieldName];
        return {
            resModel: this.props.model.resModel,
            fields: {
                [fieldName]: { ...field, type: "many2one", readonly: false, required: false },
            },
            activeFields: { [fieldName]: this.fieldInfo },
            mode: "edit",
            values: {},
        };
    }

    get fieldInfo() {
        return this.section.fieldInfo;
    }

    get fieldProps() {
        return {
            fieldInfo: this.fieldInfo,
            canCreate: false,
            canCreateEdit: false,
            canOpen: false,
            canQuickCreate: false,
            context: this.section.context,
            domain: () => this.getFilterDomain(this.section.filters.map((f) => f.value)),
            otherSources: this.otherSources,
            placeholder: this.props.placeholder ?? _t("+ Add %s", this.section.label),
            string: this.section.label,
            updateMany: (records) => this.onFilterSelected(records),
        };
    }

    /**
     * Additional autocomplete sources, displayed after the records.
     */
    get otherSources() {
        return [];
    }

    get isAllActive() {
        return this.section.filters.length && this.section.filters.every((filter) => filter.active);
    }

    get nextFilterId() {
        nextId += 1;
        return nextId;
    }

    get section() {
        return this.props.section;
    }

    getFilterColor(filter) {
        return filter.colorIndex !== null
            ? "o_calendar_filter_color_" + getColor(filter.colorIndex)
            : "";
    }

    getSortedFilters() {
        const types = ["user", "record", "dynamic"];
        return this.section.filters.slice().sort((a, b) => {
            if (a.type === b.type) {
                const va = a.value ? -1 : 0;
                const vb = b.value ? -1 : 0;
                //Condition to put unvaluable item (eg: Open Shifts) at the end of the sorted list.
                if (a.type === "dynamic" && va !== vb) {
                    return va - vb;
                }
                return a.label.localeCompare(b.label, undefined, {
                    numeric: true,
                    sensitivity: "base",
                    ignorePunctuation: true,
                });
            } else {
                return types.indexOf(a.type) - types.indexOf(b.type);
            }
        });
    }

    getFilterAvatar(filter) {
        if (!this.section.hasAvatar || !filter.hasAvatar) {
            return null;
        }
        const { field, model } = this.section.avatar;
        return { src: `/web/image/${model}/${filter.value}/${field}` };
    }

    onFilterSelected(ids) {
        const idsList = ids.map((id) => id.id);
        return this.props.model.createFilter(this.section.fieldName, idsList);
    }

    getFilterDomain(activeIds) {
        return [["id", "not in", activeIds]];
    }

    toggleSection() {
        this.state.collapsed = !this.state.collapsed;
    }

    onFilterInputChange(filter, ev) {
        this.props.model.updateFilters(this.section.fieldName, [filter], ev.target.checked);
        render(this);
    }

    onAllFilterInputChange(ev) {
        const { fieldName, filters } = this.section;
        this.props.model.updateFilters(fieldName, filters, ev.target.checked);
        render(this);
    }

    onFilterRemoveBtnClick(filter, ev) {
        if (!ev.currentTarget.dataset.unlinked) {
            ev.currentTarget.dataset.unlinked = true;
            this.props.model.unlinkFilter(this.section.fieldName, filter.recordId);
            render(this);
        }
    }
}
