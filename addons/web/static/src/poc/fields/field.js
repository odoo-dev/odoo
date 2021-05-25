/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Domain } from "@web/core/domain";
import { useFieldModel } from "./field_model_hook";

const { Component, QWeb } = owl;
const { xml } = owl.tags;

export class MissingPropsError extends Error {}
export class SpecializedFieldNotFound extends Error {}

let id = 0;
export class Field extends Component {
    setup() {
        if (!("name" in this.props)) {
            throw new MissingPropsError(`Field must have a name`);
        }
        if (!("dataPointId" in this.props)) {
            throw new MissingPropsError(`Field must have a data point id`);
        }

        this.model = useFieldModel();
        this.config = {};
        this.dataPoint = null;
        this.id = id++;
    }
    async willStart() {
        this.dataPoint = this.model.findDataPoint(this.props.dataPointId);
        this.config = await this.computeConfig(this.props);
    }
    async willUpdateProps(nextProps) {
        this.dataPoint = this.model.findDataPoint(this.props.dataPointId);
        this.config = await this.computeConfig(nextProps);
    }

    getComponent(props) {
        const fieldRegistry = registry.category("fields");
        if (props.as) {
            if (fieldRegistry.contains(props.as)) {
                return fieldRegistry.get(props.as);
            } else {
                throw new SpecializedFieldNotFound(`Cannot find type ${props.as}`);
            }
        }
        const type = this.dataPoint.fieldsMeta[props.name].type;
        return fieldRegistry.get(type);
    }
    async computeConfig(props) {
        const dataPoint = this.dataPoint;
        // const decorations = this.computeDecorations(props);
        const modifiers = this.computeModifiers(props);

        let value = dataPoint.data[props.name];
        if (dataPoint.changes && props.name in dataPoint.changes) {
            value = dataPoint.changes[props.name];
        }

        return {
            Component: this.getComponent(props),
            props: {
                attrs: props.attrs || {},
                decorations: {},
                key: props.key || `${props.name}_${this.id}`,
                mode: (!modifiers.readonly && props.mode) || "read",
                modifiers,
                name: props.name,
                dataPoint,
                value,
                viewType: props.viewType,
            },
        };
    }
    computeDecorations(props) {
        const decorationValues = {};

        const dataPoint = this.dataPoint;
        const context = Object.assign(
            { True: true, False: false },
            dataPoint.data,
            dataPoint.changes
        );

        for (const [decorationName, domainStr] of Object.entries(props.decorations || {})) {
            const domain = new Domain(domainStr);
            decorationValues[decorationName] = domain.contains(context);
        }

        return decorationValues;
    }
    computeModifiers(props) {
        const modifierValues = {};

        const dataPoint = this.dataPoint;
        const context = Object.assign(
            { True: true, False: false },
            dataPoint.data,
            dataPoint.changes
        );

        for (const [modifierName, modifierValue] of Object.entries(props.modifiers || {})) {
            if ([true, false].includes(modifierValue)) {
                modifierValues[modifierName] = modifierValue;
            } else {
                const domain = new Domain(modifierValue);
                modifierValues[modifierName] = domain.contains(context);
            }
        }

        for (const modifierName of ["required", "readonly"]) {
            if (dataPoint.fieldsMeta[props.name][modifierName]) {
                modifierValues[modifierName] = dataPoint.fieldsMeta[props.name][modifierName];
            }
        }

        return modifierValues;
    }

    onFieldChanged(ev) {
        this.trigger("changes", {
            fieldName: this.props.name,
            previous: this.config.props.value,
            current: ev.detail,
        });
        this.model.notifyChanges(this.props.dataPointId, { [this.props.name]: ev.detail });
    }
}
Field.template = xml`
    <div
        class="o_field"
        t-att-class="{
            o_field_invisible: config.props.modifiers.invisible,
            o_field_readonly: config.props.modifiers.readonly,
            o_field_required: config.props.modifiers.required,
        }"
        t-att-data-name="props.name"
    >
        <t t-if="!config.props.modifiers.invisible">
            <t  t-component="config.Component"
                t-props="config.props"
                t-on-field-changed.stop="onFieldChanged"
            />
        </t>
    </div>
`;
// Field.defaultProps = {
//     attrs: {},
// };
// Field.props = {
//     attrs: { optional: true, type: Object },
//     key: { optional: true, type: String },
//     name: String,
//     record: Object, // should we pass a data point id or directly the data point?
//     widget: { optional: true, type: String },
// };

QWeb.registerComponent("Field", Field);
