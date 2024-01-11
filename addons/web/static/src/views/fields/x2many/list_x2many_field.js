import { registry } from "@web/core/registry";
import { formatPercentage } from "../formatters";
import { standardFieldProps } from "../standard_field_props";

import { usePosition } from "@web/core/position/position_hook";
import { useService } from "@web/core/utils/hooks";
import { evaluateBooleanExpr } from "@web/core/py_js/py";
import { ListRenderer } from "@web/views/list/list_renderer";
import {
    useActiveActions,
    useAddInlineRecord,
    useX2ManyCrud,
} from "@web/views/fields/relational_utils";
import { TagsList } from "@web/core/tags_list/tags_list";

import { Component, useState, useExternalListener, useRef } from "@odoo/owl";

export class ListX2ManyField extends Component {
    static template = "web.ListX2ManyField";
    static components = { ListRenderer, TagsList };
    static props = {
        ...standardFieldProps,
        addLabel: { type: String, optional: true },
        editable: { type: String, optional: true },
        viewMode: { type: String, optional: true },
        widget: { type: String, optional: true },
        crudOptions: { type: Object, optional: true },
        string: { type: String, optional: true },
        relatedFields: { type: Object, optional: true },
        views: { type: Object, optional: true },
        domain: { type: [Array, Function], optional: true },
        context: { type: Object },
    };

    setup() {
        this.state = useState({
            popupOpen: false,
        });
        this.widgetRef = useRef("widgetRef");
        this.popupRef = useRef("analyticDropdown");
        usePosition("analyticDropdown", () => this.widgetRef.el);
        useExternalListener(window, "click", this.onWindowClick, true);
        this.addInLine = useAddInlineRecord({
            addNew: (...args) => this.list.addNewRecord(...args),
        });
        this.field = this.props.record.fields[this.props.name];
        this.archInfo = this.props.views?.[this.props.viewMode] || {};
        const { activeActions } = this.archInfo;
        const subViewActiveActions = activeActions;
        const { removeRecord } = useX2ManyCrud(() => this.list, this.isMany2Many);
        this.activeActions = useActiveActions({
            crudOptions: Object.assign({}, this.props.crudOptions, {
                onDelete: removeRecord,
            }),
            fieldType: this.isMany2Many ? "many2many" : "one2many",
            subViewActiveActions,
            getEvalParams: (props) => {
                return {
                    evalContext: props.record.evalContext,
                    readonly: props.readonly,
                };
            },
        });
    }

    mainElementFocus() {
        this.state.popupOpen = true;
    }

    onWindowClick(ev) {
        if (
            this.state.popupOpen &&
            !this.popupRef?.el?.contains(ev.target) &&
            !this.widgetRef?.el?.contains(ev.target)
        ) {
            this.state.popupOpen = false;
        }
    }

    // copied from x2many_field
    get isMany2Many() {
        return this.field.type === "many2many" || this.props.widget === "many2many";
    }

    get list() {
        return this.props.record.data[this.props.name];
    }

    get plans() {
        return Object.keys(this.props.relatedFields).filter((n) => n.startsWith('x_plan')).concat('account_id')
    }

    get planSummary() {
        // debugger;
        const plans = {};
        for (const rec of this.list.records) {
            for (const plan of this.plans) {
                if (rec.data[plan]) {
                    plans[plan] = (plans[plan] || 0) + rec.data.percentage;
                }
            }
        }
        const planTags = [];
        for (const [key, value] of Object.entries(plans)) {
            planTags.push({
                color: 1,
                text: `${this.props.relatedFields[key].string } ${formatPercentage(value)}`,
            });
        }
        return planTags;
    }

    get tags() {
        const accountTags = [];
        for (const rec of this.list.records) {
            const accounts = this.plans.map((plan) => rec.data[plan][1]).filter(Boolean)
            accountTags.push({
                text: `${formatPercentage(rec.data.percentage)} ${accounts.join(" | ")}`,
            });
        }
        return accountTags;
    }

    get rendererProps() {
        const archInfo = this.props.views?.[this.props.viewMode];
        const props = {
            archInfo,
            list: this.props.record.data[this.props.name],
            openRecord: () => {}, //this.openRecord.bind(this),
            evalViewModifier: (modifier) => {
                return evaluateBooleanExpr(modifier, this.list.evalContext);
            },
        };

        const editable =
            (archInfo.activeActions.edit && archInfo.editable) || this.props.editable || true;
        props.activeActions = this.activeActions;
        props.cycleOnTab = false;
        props.editable = !this.props.readonly && editable;
        // props.nestedKeyOptionalFieldsData = this.nestedKeyOptionalFieldsData;
        props.onAdd = (params) => {
            params.editable = true;
            // !this.props.readonly && ("editable" in params ? params.editable : editable);
            this.addInLine(params);
        };
        const openFormView = props.editable ? archInfo.openFormView : false;
        props.onOpenFormView = openFormView ? this.switchToForm.bind(this) : undefined;
        return props;
    }
}

// copied from x2many_field
export const listX2ManyField = {
    component: ListX2ManyField,
    useSubView: true,
    extractProps: (
        { attrs, relatedFields, viewMode, views, widget, options, string },
        dynamicInfo
    ) => {
        const props = {
            addLabel: attrs["add-label"],
            context: dynamicInfo.context,
            domain: dynamicInfo.domain,
            crudOptions: options,
            string,
        };
        if (viewMode) {
            props.views = views;
            props.viewMode = viewMode;
            props.relatedFields = relatedFields;
        }
        if (widget) {
            props.widget = widget;
        }
        return props;
    },
};

registry.category("fields").add("list.one2many", listX2ManyField);
registry.category("fields").add("list.many2many", listX2ManyField);
