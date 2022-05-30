/** @odoo-module **/
import { registry } from "@web/core/registry";
import { useEffect } from "@web/core/utils/hooks";
import { snakeToCamel } from "@web/core/utils/strings";
import { isAttr } from "@web/core/utils/xml";
import { getX2MViewModes, X2M_TYPES } from "@web/views/helpers/view_utils";

const { Component, tags } = owl;

const fieldRegistry = registry.category("fields");

export class Field extends Component {
    setup() {
        useEffect(() => {
            this.el.classList.add("o_field_widget");
            this.el.classList.add(`o_field_${this.type}`);
            this.el.setAttribute("name", this.props.name);
        });
    }

    get effectiveFieldComponent() {
        return Field.getEffectiveFieldComponent(this.props.record, this.type, this.props.name);
    }

    get type() {
        return this.props.type || this.props.record.fields[this.props.name].type;
    }

    get effectiveFieldComponentProps() {
        const record = this.props.record;
        const field = record.fields[this.props.name];
        const activeField = record.activeFields[this.props.name];

        const readonyFromModifiers = activeField.modifiers.readonly == true;
        const readonlyFromViewMode = this.props.readonly;

        // currently unused
        //const invisible = activeField.modifiers.invisible === true;

        let value = this.props.record.data[this.props.name];
        if (value === undefined) {
            value = null;
        }

        if (activeField.decorations) {
            this.props.decorations = activeField.decorations;
        }

        return {
            attrs: activeField.attrs || {},
            options: activeField.options || {},
            required: this.props.required || field.required || false,
            update: async (value, options = { name: null }) => {
                await record.update(options.name || this.props.name, value);
                // We save only if we're on view mode readonly and no readonly field modifier
                if (readonlyFromViewMode && !readonyFromModifiers) {
                    return record.save();
                }
            },
            value,
            formatValue: this.formatValue.bind(this),
            parseValue: this.parseValue.bind(this),
            ...this.props,
            type: field.type,
            readonly: readonlyFromViewMode || readonyFromModifiers || false,
        };
    }

    formatValue(value) {
        const record = this.props.record;
        const field = record.fields[this.props.name];
        const activeField = record.activeFields[this.props.name];

        const formatterRegistry = registry.category("formatters");
        if (formatterRegistry.contains(activeField.widget)) {
            return formatterRegistry.get(activeField.widget)(value, { field });
        } else if (formatterRegistry.contains(field.type)) {
            return formatterRegistry.get(field.type)(value, { field });
        } else {
            console.warn(`No formatter found for ${field.type} field. It should be implemented.`);
            return String(value);
        }
    }

    parseValue(value) {
        const record = this.props.record;
        const field = record.fields[this.props.name];
        const activeField = record.activeFields[this.props.name];

        const parserRegistry = registry.category("parsers");
        if (parserRegistry.contains(activeField.widget)) {
            return parserRegistry.get(activeField.widget)(value);
        } else if (parserRegistry.contains(field.type)) {
            return parserRegistry.get(field.type)(value);
        } else {
            console.warn(`No parser found for ${field.type} field. It should be implemented.`);
            return value;
        }
    }
}
Field.template = tags.xml/* xml */ `
    <t t-component="effectiveFieldComponent" t-props="effectiveFieldComponentProps" t-key="props.record.id"/>
`;

class DefaultField extends Component {
    onChange(ev) {
        this.props.update(ev.target.value);
    }
}
DefaultField.template = tags.xml`
    <t>
        <span t-if="props.readonly" t-esc="props.value" />
        <input t-else="" class="o_input" t-att-value="props.value" t-att-id="props.id" t-on-change="onChange" />
    </t>
`;

Field.getEffectiveFieldComponent = function (record, type, fieldName) {
    if (record.viewMode) {
        const specificType = `${record.viewMode}.${type}`;
        if (fieldRegistry.contains(specificType)) {
            return fieldRegistry.get(specificType);
        }
    }
    if (!fieldRegistry.contains(type)) {
        const fields = record.fields;
        type = fields[fieldName].type;
    }
    // todo: remove fallback? yep
    return fieldRegistry.get(type, DefaultField);
};

Field.parseFieldNode = function (node, fields, viewType) {
    const name = node.getAttribute("name");
    const widget = node.getAttribute("widget");
    const field = fields[name];
    const fieldInfo = {
        name,
        string: node.getAttribute("string") || field.string,
        widget,
        options: {}, // can be already used to add options like 'group_by_tooltip'
        modifiers: {}, // a lot of code is easier if it always exists.
        onChange: isAttr(node, "on_change").truthy(),
        optionsAttribute: node.getAttribute("options") || "{}",
        modifiersAttribute: node.getAttribute("modifiers") || "{}",
        FieldComponent: Field.getEffectiveFieldComponent({ fields, viewType }, widget, name),
        attrs: {},
    };
    for (const attribute of node.attributes) {
        if (attribute.name in Field.forbiddenAttributeNames) {
            throw new Error(Field.forbiddenAttributeNames[attribute.name]);
        }

        // prepare field decorations
        if (attribute.name.startsWith("decoration-")) {
            const decorationName = attribute.name.replace("decoration-", "");
            fieldInfo.decorationAttributes = fieldInfo.decorationAttributes || {};
            fieldInfo.decorationAttributes[decorationName] = attribute.value;
        }

        // FIXME: black list special attributes like on_change, name... ?
        fieldInfo.attrs[snakeToCamel(attribute.name)] = attribute.value;
    }
    if (X2M_TYPES.includes(field.type)) {
        fieldInfo.viewMode = getX2MViewModes(node.getAttribute("mode"))[0];
    }

    // if (!fieldInfo.invisible && X2M_TYPES.includes(field.type)) {
    //     fieldInfo.relation = field.relation;
    //     const relatedFields = {
    //         id: { name: "id", type: "integer", readonly: true },
    //     };
    //     if (FieldClass.useSubView) {
    //         // FIXME: this part is incomplete, we have to parse the subview archs
    //         // and extract the field info
    //         // fieldInfo.views = field.views;
    //         // const firstView = fieldInfo.views[fieldInfo.viewMode];
    //         // if (firstView) {
    //         //     Object.assign(relatedFields, firstView.fields);
    //         // }
    //     }
    //     // add fields required by specific FieldComponents
    //     Object.assign(relatedFields, FieldClass.fieldsToFetch);
    //     // special case for color field
    //     const colorField = fieldInfo.options.color_field;
    //     if (colorField) {
    //         relatedFields[colorField] = { name: colorField, type: "integer" };
    //     }
    //     fieldInfo.relatedFields = relatedFields;
    // }
    return fieldInfo;
};

Field.forbiddenAttributeNames = {
    decorations: `You cannot use the "decorations" attribute name as it is used as generated prop name for the composite decoration-<something> attributes.`,
};
