/** @odoo-module **/

import { deserializeDate, deserializeDateTime } from "@web/core/l10n/dates";
import { registry } from "@web/core/registry";
import { unique } from "@web/core/utils/arrays";
import { Model } from "@web/views/helpers/model";
import { read } from "./fake_data";

const fieldStreamConversionRegistry = registry.category("fieldStreamConversion");

fieldStreamConversionRegistry.add("date", {
    deserialize: (value) => deserializeDate(value),
    serialize: (value) => value,
});
fieldStreamConversionRegistry.add("datetime", {
    deserialize: (value) => deserializeDateTime(value),
    serialize: (value) => value,
});

const DEFAULT_FIELD_STREAM_CONVERSION = {
    deserialize: (value) => value,
    serialize: (value) => value,
};

function deserializeField(type, value) {
    const conversion = fieldStreamConversionRegistry.get(type, DEFAULT_FIELD_STREAM_CONVERSION);
    return conversion.deserialize(value);
}

// ------------------------------------------------------------------------------------------------

export class FieldsModel extends Model {
    setup(params) {
        this.readonly = params.readonly;
        this.resId = params.resId;
        this.fields = params.fields;
        this.fieldsInfo = params.fieldsInfo;
        this.fieldNames = unique(Object.values(this.fieldsInfo).map((f) => f.name));
    }

    deserialize(records) {
        return records.map((record) => {
            const data = {};
            for (const [key, value] of Object.entries(record)) {
                const field = this.fields[key];
                data[key] = deserializeField(field.type, value);
            }
            return data;
        });
    }

    async load(params) {
        if (params.resId) {
            this.resId = params.resId;
        }
        const data = this.deserialize(await read([this.resId]))[0];
        this.data = data;
        this.notify();
    }
}
