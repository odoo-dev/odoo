/* @odoo-module */

import { DynamicList } from "./dynamic_list";
import { getFieldsSpec } from "./utils";

export class DynamicRecordList extends DynamicList {
    setup(params) {
        super.setup(params);
        this.records = params.data.records.map(
            (r) =>
                new this.model.constructor.Record(this.model, {
                    activeFields: this.activeFields,
                    fields: this.fields,
                    resModel: this.resModel,
                    context: this.context,
                    resIds: params.data.records.map((r) => r.id),
                    data: r,
                })
        );
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    async _load() {
        const fieldSpec = getFieldsSpec(this.activeFields, this.fields);
        console.log("Unity field spec", fieldSpec);
        const kwargs = {
            fields: fieldSpec,
            domain: this.domain,
            offset: this.offset,
            limit: this.limit,
            context: { bin_size: true, ...this.context },
        };
        const response = await this.model.orm.call(
            this.resModel,
            "web_search_read_unity",
            [],
            kwargs
        );
        console.log("Unity response", response);
        this.records = response.records.map(
            (r) =>
                new this.model.constructor.Record(this.model, {
                    activeFields: this.activeFields,
                    fields: this.fields,
                    resModel: this.resModel,
                    context: this.context,
                    resIds: response[0].records.map((r) => r.id),
                    data: r,
                })
        );
        this.count = response.length;
    }
}
DynamicRecordList.WEB_SEARCH_READ_COUNT_LIMIT = 10000; // FIXME: move
