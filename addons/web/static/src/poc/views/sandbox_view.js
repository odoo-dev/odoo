/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/service_hook";
import { evaluateExpr } from "@web/core/py_js/py";

import { useFieldModel } from "../fields/field_model_hook";

const { Component } = owl;
const { useState } = owl.hooks;

const viewTemplate = /*xml*/ `
    <sandbox>
        <field name="id" id="the_id_field" />
        <field name="display_name" />
        <field name="active" widget="boolean_text" readonly="1" label="Active (text)" />
        <field name="active" />
        <field name="name" attrs="{'invisible': [['active', '=', False]]}" />
        <field name="user_id" attrs="{'invisible': [['active', '=', False]]}" />
    </sandbox>
`;

class SandBoxView extends Component {
    setup() {
        this.state = useState({
            mode: "read",
            changes: [],
        });
        this.viewService = useService("view");

        this.model = useFieldModel();
    }
    async willStart() {
        const viewInfo = await this.viewService.loadViews(
            {
                model: this.props.model,
                views: this.props.views,
                context: this.props.context,
            },
            {
                actionId: this.props.actionId,
                withFilters: this.props.withFilters,
                withActionMenus: this.props.withActionMenus,
            }
        );
        this.viewInfo = viewInfo[this.props.type];
        this.fields = this.viewInfo.fields;

        this.templateFields = this.getFieldsFromTemplate(viewTemplate);

        const modelFieldsInfo = {};
        for (const field of this.getModelFieldsInfo()) {
            modelFieldsInfo[field.name] = modelFieldsInfo[field.name] || {
                name: field.name,
                as: field.as,
            };
        }

        this.dpId = this.model.makeDataPoint({
            modelName: this.props.model,
            resId: this.props.recordId,
            resIds: this.props.recordIds,
            fieldsMeta: this.fields,
            viewType: this.props.type,
            fieldsInfo: {
                form: modelFieldsInfo,
            },
        });

        await this.model.loadFields(this.dpId, {
            fieldNames: this.fieldsInfo.map((f) => f.name),
            viewType: this.props.type,
        });

        console.log(this);
    }

    getFieldsFromTemplate(template) {
        const parser = new DOMParser();
        const { documentElement: doc } = parser.parseFromString(template, "application/xml");

        const fields = [];
        for (const child of doc.children) {
            if (child.nodeName === "field") {
                const attrs = {};
                for (const attrName of child.getAttributeNames()) {
                    attrs[attrName] = child.getAttribute(attrName);
                }
                fields.push(attrs);
            }
        }

        return fields;
    }
    getModelFieldsInfo() {
        const context = { True: true, False: false };

        return this.templateFields.map((field) => {
            return {
                name: field.name,
                as: field.widget,
                required: Boolean(evaluateExpr(field.required || "False", context)),
                readonly: Boolean(evaluateExpr(field.readonly || "False", context)),
                invisible: Boolean(evaluateExpr(field.invisible || "False", context)),
            };
        });
    }
    get fieldsInfo() {
        const context = { True: true, False: false };

        return this.templateFields.map((field, index) => {
            const attrs = "attrs" in field ? evaluateExpr(field.attrs || "{}", context) : {};
            const modifiers = {
                required:
                    Boolean(evaluateExpr(field.required || "False", context)) ||
                    attrs.required ||
                    false,
                readonly:
                    Boolean(evaluateExpr(field.readonly || "False", context)) ||
                    attrs.readonly ||
                    false,
                invisible:
                    Boolean(evaluateExpr(field.invisible || "False", context)) ||
                    attrs.invisible ||
                    false,
            };

            return {
                name: field.name,
                as: field.widget,
                modifiers,
                key: field.id || `${field.name}_${index}`,
                dataPointId: this.dpId,
                label: field.label || this.fields[field.name].string,
                mode: this.state.mode,
                viewType: this.props.type,
            };
        });
    }

    get isDirty() {
        return this.model.isDirty(this.dpId);
    }
    addChanges(ev) {
        this.state.changes.push(ev.detail);
    }
    reset(mode = "read") {
        this.state.mode = mode;
        this.state.changes = [];
    }
    discard() {
        this.model.discard(this.dpId);
        this.reset("read");
    }
    save() {
        this.model.save(this.dpId);
        this.reset("read");
    }
}
SandBoxView.type = "form";
SandBoxView.display_name = "form";
SandBoxView.multiRecord = false;

registry.category("views").add("form", SandBoxView);
