/** @odoo-module **/

import { Field } from "../fields_layer/field";
import { Schema } from "../fields_layer/schema";

const { Component, xml, onWillStart } = owl;

export class FieldsRenderer extends Component {
    setup() {
        this.schema = new Schema({
            fieldsInfo: this.props.model.fieldsInfo,
            fields: this.props.model.fields,
            data: this.props.model.data,
            readonly: this.props.model.readonly,
        });

        onWillStart(async () => {
            await this.schema.load();
            console.log(this.schema);
        });
    }
}
FieldsRenderer.components = {
    Field,
};
FieldsRenderer.template = xml/*xml*/ `
    <div class="p-4" style="overflow-y: auto;">
        <div class="row p-2">
            <h3 class="col">Name</h3>
            <h3 class="col">Value</h3>
        </div>
        <t t-foreach="schema.entries" t-as="entry" t-key="entry">
            <t t-if="!entry_value.isInvisible">
                <div class="row p-2">
                    <div class="col" t-esc="entry_value.string" />
                    <div class="col">
                        <Field t-props="entry_value.computeProps()" />
                    </div>
                </div>
            </t>
        </t>
    </div>
`;
