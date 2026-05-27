import { Many2XAutocomplete } from "@web/views/fields/relational_utils";
import {
    Many2ManyTagsField,
    many2ManyTagsField,
} from "@web/views/fields/many2many_tags/many2many_tags_field";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

class TargetProductIdsAutocomplete extends Many2XAutocomplete {
    async onSearchMore(request) {
        const { resModel, getDomain, context, fieldString } = this.props;

        const domain = getDomain();
        let dynamicFilters = [];
        if (request.length) {
            const nameGets = await this.orm.call(resModel, "name_search", [], {
                name: request,
                domain: domain,
                operator: "ilike",
                limit: this.props.searchMoreLimit,
                context,
            });
            this.offline.cacheMany2XSearch(
                resModel,
                nameGets.map((r) => ({ id: r[0], display_name: r[1] }))
            );

            dynamicFilters = [
                {
                    description: _t("Quick search: %s", request),
                    domain: [["id", "in", nameGets.map((nameGet) => nameGet[0])]],
                },
            ];
        }
        const title = fieldString && fieldString.trim() ? fieldString : _t("Search");
        this.selectCreate({
            domain,
            context,
            filters: dynamicFilters,
            title,
        });
    }
}

export class TargetProductIdsTagsField extends Many2ManyTagsField {
    static components = {
        ...Many2ManyTagsField.components,
        Many2XAutocomplete: TargetProductIdsAutocomplete,
    };
}

export const targetProductIdsTagsField = {
    ...many2ManyTagsField,
    component: TargetProductIdsTagsField,
    additionalClasses: ["o_field_many2many_tags"],
};

registry.category("fields").add("target_product_ids_tags", targetProductIdsTagsField);
