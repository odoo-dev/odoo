import {
    Many2ManyTagsField,
    many2ManyTagsField,
} from "@web/views/fields/many2many_tags/many2many_tags_field";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";


export class Many2ManyPackageTagsField extends Many2ManyTagsField {
    setup() {
        super.setup();
        this.action = useService("action");
        this.hasNoneTag = this.props.record.data?.has_lines_without_result_package || false;
    }

    get tags() {
        const tags = super.tags;
        if (this.hasNoneTag) {
            tags.push({
                id: "datapoint_None",
                props: {
                    ...this.getTagProps(this.props.record.data[this.props.name].records.at(-1)),
                    text: _t("No Package"),
                },
            });
        }
        return tags;
    }

    getTagProps(record) {
        return {
            ...super.getTagProps(record),
            text: record.data.name,
        };
    }

    async deleteTag(id) {
        const tagRecord = this.props.record.data[this.props.name].records.find(
            (record) => record.id === id
        );
        await this.orm.call("stock.move", "unpack", [this.props.record.resId, tagRecord.resId]);
        await this.action.doAction({
            type: "ir.actions.client",
            tag: "soft_reload",
        });
    }

    get showM2OSelectionField() {
        return false;
    }
}

export const many2ManyPackageTagsField = {
    ...many2ManyTagsField,
    component: Many2ManyPackageTagsField,
    additionalClasses: ['o_field_many2many_tags'],
    relatedFields: () => [
        { name: "name", type: "char" },
    ],
}

registry.category("fields").add("package_m2m", many2ManyPackageTagsField);
