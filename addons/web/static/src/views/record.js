/** @odoo-module **/

import { useService } from "@web/core/utils/hooks";
import { useModel } from "@web/views/helpers/model";
import { RelationalModel } from "@web/views/relational_model";
const { Component, xml, onWillStart, onWillUpdateProps } = owl;

class _Record extends Component {
    setup() {
        const fieldnames = this.props.info.fields;
        const activeFields = Object.fromEntries(
            fieldnames.map((f) => [f, { attrs: {}, options: {}, domain: "[]" }])
        );

        this.model = useModel(RelationalModel, {
            resId: this.props.info.resId,
            resModel: this.props.info.resModel,
            fields: this.props.fields,
            viewMode: "form",
            rootType: "record",
            activeFields,
            mode: this.props.info.mode === "edit" ? "edit" : undefined,
        });
        onWillUpdateProps(async (nextProps) => {
            await this.model.load({ resId: nextProps.info.resId, mode: nextProps.info.mode });
        });
    }
}
_Record.template = xml`<t t-slot="default" record="model.root"/>`;

export class Record extends Component {
    setup() {
        const orm = useService("orm");
        onWillStart(async () => {
            this.fields = await orm.call(this.props.resModel, "fields_get", [], {});
        });
    }
}
Record.template = xml`<_Record fields="fields" slots="props.slots" info="props" />`;
Record.components = { _Record };
Record.props = ["resModel", "resId", "fields", "slots", "mode?"];
