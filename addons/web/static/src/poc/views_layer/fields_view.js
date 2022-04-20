/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useModel } from "@web/views/helpers/model";
import { FieldsArchParser } from "./fields_arch_parser";
import { FieldsRenderer } from "./fields_renderer";
import { FieldsModel } from "./model";
import { ARCH, FIELDS } from "./fake_data";

const { Component, xml } = owl;

export class FieldsView extends Component {
    setup() {
        const fields = FIELDS;

        const parser = new FieldsArchParser();
        const fieldsInfo = parser.parse(ARCH, fields);

        this.model = useModel(FieldsModel, {
            readonly: false,
            resId: 1,
            fields,
            fieldsInfo,
        });
    }
}
FieldsView.components = {
    FieldsRenderer,
};
FieldsView.template = xml/*xml*/ `
    <button t-on-click="() => model.load({ resId: 1 })">Record 1</button>
    <button t-on-click="() => model.load({ resId: 2 })">Record 2</button>
    <FieldsRenderer model="model" t-key="model.resId" />
`;
FieldsView.type = "form";

registry.category("views").add("fields", FieldsView);
