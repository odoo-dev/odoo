/** @odoo-module **/

import { registry } from "@web/core/registry";

const { Component, QWeb } = owl;
const { xml } = owl.tags;

export class FieldTypeNotFound extends Error {}

let id = 0;
export class Field extends Component {
    setup() {
        this.config = {};
        this.id = id++;
    }
    async willStart() {
        this.config = await this.computeConfig(this.props);
    }
    async willUpdateProps(nextProps) {
        this.config = await this.computeConfig(nextProps);
    }

    getComponent(props) {
        const fieldRegistry = registry.category("fields");
        if (!fieldRegistry.contains(props.type)) {
            throw new FieldTypeNotFound();
        }
        return fieldRegistry.get(props.type);
    }
    async computeConfig(props) {
        return {
            Component: this.getComponent(props),
            props: {
                key: props.id || `field_${this.id}`,
                mode: props.mode || "read",
                value: props.value,
            },
        };
    }
}
Field.template = xml`
    <t class="o_field" t-component="config.Component" t-props="config.props" />
`;
Field.props = {
    id: {
        type: String,
        optional: true,
    },
    mode: {
        type: String,
        optional: true,
        validate: (mode) => ["read", "write"].includes(mode),
    },
    type: String,
    value: true,
};
Field.defaultProps = {
    mode: "read",
};

QWeb.registerComponent("Field", Field);
