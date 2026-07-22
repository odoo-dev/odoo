import { registry } from "@web/core/registry";
import { X2ManyTagsField, many2ManyTagsField } from "./many2many_tags_field";

export class KanbanX2ManyTagsField extends X2ManyTagsField {
    static template = "web.KanbanX2ManyTagsField";

    get tags() {
        return super.tags.filter((tag) => tag.props.color !== 0);
    }
}

export const kanbanX2ManyTagsField = {
    ...many2ManyTagsField,
    component: KanbanX2ManyTagsField,
};

registry.category("fields").add("card.many2many_tags", kanbanX2ManyTagsField);
