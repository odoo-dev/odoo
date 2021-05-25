/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useFieldModel } from "@web/poc/field_model_hook";

import { isComponent } from "web.utils";
import legacyFieldRegistry from "web.field_registry";
import legacyFieldRegistryOwl from "web.field_registry_owl";
import { ComponentAdapter } from "web.OwlCompatibility";

const { Component } = owl;
const { xml } = owl.tags;

const fieldsRegistry = registry.category("fields");

function createAdapter(LegacyField) {
    class FieldWidgetAdapter extends ComponentAdapter {
        setup() {
            this.env = Component.env;
        }
        get widgetArgs() {
            return [this.props.fieldName, this.props.record, this.props.options];
        }
        renderWidget() {}
        updateWidget() {}
    }

    class LegacyFieldAdapter extends Component {
        setup() {
            this.model = useFieldModel();
        }
        get Component() {
            let C;
            if (this.isWidgetComponent) {
                C = class extends LegacyField {};
            } else {
                C = LegacyField.extend({ isQuickEditable: false });
            }
            return C;
        }
        get isWidgetComponent() {
            return isComponent(LegacyField);
        }
        get optionsProp() {
            return {
                hasReadonlyModifier: this.props.modifiers.readonly,
                mode: this.props.mode === "write" ? "edit" : "readonly",
                viewType: this.props.viewType,
            };
        }
        convertDataPointToLegacyRecord(dataPoint) {
            const legacyNames = {
                cache: "_cache",
                changes: "_changes",
                domains: "_domains",
                rawChanges: "_rawChanges",
                fieldsMeta: "fields",
                orderedResIds: "orderedResIDs",
                parentId: "parentID",
                resId: "res_id",
                resIds: "res_ids",
                specialDataCache: "_specialDataCache",
                editionViewType: "_editionViewType",
            };

            const record = {};
            for (const [key, value] of Object.entries(dataPoint)) {
                const name = legacyNames[key] || key;
                record[name] = value;
            }
            Object.assign(record.data, record._changes);
            return record;
        }

        onFieldChanged(ev) {
            ev.stopPropagation();
            ev.stopImmediatePropagation();

            this.trigger("changes", {
                fieldName: this.props.name,
                previous: this.props.value,
                current: ev.detail.changes[this.props.name],
            });
            this.model.notifyChanges(ev.detail.dataPointID, ev.detail.changes);
        }
    }
    LegacyFieldAdapter.components = { FieldWidgetAdapter };
    LegacyFieldAdapter.template = xml/*xml*/ `
        <t t-log="props.name, props.value" t-key="props.mode + props.value">
            <t t-if="isWidgetComponent">
                <t t-component="Component"
                    fieldName="props.name"
                    record="convertDataPointToLegacyRecord(props.dataPoint)"
                    options="optionsProp"
                    t-on-field-changed.stop="onFieldChanged"
                />
            </t>
            <t t-else="">
                <FieldWidgetAdapter
                    Component="Component"
                    fieldName="props.name"
                    record="convertDataPointToLegacyRecord(props.dataPoint)"
                    options="optionsProp"
                    t-on-field-changed.stop="onFieldChanged"
                />
            </t>
        </t>
    `;
    LegacyFieldAdapter.isLegacy = true;

    return LegacyFieldAdapter;
}

function register(name, LegacyField) {
    if (fieldsRegistry.contains(name)) {
        return;
    }
    fieldsRegistry.add(name, createAdapter(LegacyField));
}

for (const [name, LegacyField] of Object.entries(legacyFieldRegistryOwl.entries())) {
    register(name, LegacyField);
}
for (const [name, LegacyField] of Object.entries(legacyFieldRegistry.entries())) {
    register(name, LegacyField);
}

legacyFieldRegistryOwl.onAdd(register);
legacyFieldRegistry.onAdd(register);
