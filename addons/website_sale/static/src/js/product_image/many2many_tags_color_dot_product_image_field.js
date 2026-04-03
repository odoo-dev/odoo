import { registry } from "@web/core/registry";
import {
    many2ManyTagsColorDotField,
    Many2ManyTagsColorDotField,
} from "@web/views/fields/many2many_tags_color_dot/many2many_tags_color_dot_field";

export class Many2ManyTagsColorDotProductImageField extends Many2ManyTagsColorDotField {
    get tagsListProps() {
        return {
            ...super.tagsListProps,
            visibleItemsLimit: 11,
        };
    }
}

export const many2ManyTagsColorDotProductImageField = {
    ...many2ManyTagsColorDotField,
    component: Many2ManyTagsColorDotProductImageField,
};

registry.category("fields").add(
    "many2many_tags_color_dot_product_image",
    many2ManyTagsColorDotProductImageField
);
