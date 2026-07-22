import { registry } from "@web/core/registry";
import {
    many2ManyTagsField,
    X2ManyTagsField,
} from "@web/views/fields/many2many_tags/many2many_tags_field";
import { useOpenMany2XRecord } from "@web/views/fields/relational_utils";

export class MassMailingX2ManyTagsField extends X2ManyTagsField { 
    setup() {
        super.setup();
        // Override the onRecordSaved to reload the parent
        // record (mailing) after one of the selected tags
        // (dynamic lists) has been edited, in order to
        // update the total number of recipients.
        const openMany2xRecord = useOpenMany2XRecord({
            resModel: this.relation,
            activeActions: {
                create: false,
                write: true,
            },
            onRecordSaved: async (record) => {
                const records = this.props.record.data[this.props.name].records;
                const resPromise = records.find((r) => r.resId === record.resId).load();
                resPromise.then(() => this.props.record.load());
                return resPromise;
            },
        });
        // The parent record should be saved before editing a
        // selected tag (list), otherwise it will remain dirty
        // and the reload on save will not occur properly.
        this.openMany2xRecord = async (options) => {
            await this.props.record.save(); 
            return openMany2xRecord(options);
        };
    }
}

export const massMailingX2ManyTagsField = {
    ...many2ManyTagsField,
    component: MassMailingX2ManyTagsField,
};

registry.category("fields").add("mailing_many2many_tags", massMailingX2ManyTagsField);
