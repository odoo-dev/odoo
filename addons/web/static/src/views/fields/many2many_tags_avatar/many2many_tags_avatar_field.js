/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Many2XAutocomplete } from "@web/views/fields/relational_utils";
import {
    many2ManyTagsField,
    Many2ManyTagsField,
} from "@web/views/fields/many2many_tags/many2many_tags_field";
import { TagsList } from "../many2many_tags/tags_list";

export class Many2ManyTagsAvatarField extends Many2ManyTagsField {
    static template = "web.Many2ManyTagsAvatarField";
    static components = {
        Many2XAutocomplete,
        TagsList,
    };
    static props = {
        ...Many2ManyTagsField.props,
        withCommand: { type: Boolean, optional: true },
        getDomain: { type: Function },
    };

    get tags() {
        return super.tags.map((tag) => ({
            ...tag,
            img: `/web/image/${this.relation}/${tag.resId}/avatar_128`,
            onDelete: !this.props.readonly ? () => this.deleteTag(tag.id) : undefined,
        }));
    }
}

export const many2ManyTagsAvatarField = {
    ...many2ManyTagsField,
    component: Many2ManyTagsAvatarField,
    extractProps: (fieldInfo) => ({
        ...many2ManyTagsField.extractProps(fieldInfo),
        withCommand: fieldInfo.viewType === "form",
        getDomain: fieldInfo.getDomain,
    }),
};

registry.category("fields").add("many2many_tags_avatar", many2ManyTagsAvatarField);

export class ListKanbanMany2ManyTagsAvatarField extends Many2ManyTagsAvatarField {
    static props = {
        ...Many2ManyTagsAvatarField.props,
        itemsVisible: { type: Number, optional: true },
    };
    static defaultProps = {
        ...Many2ManyTagsAvatarField.defaultProps,
        itemsVisible: 3,
    };

    getTagProps(record) {
        return {
            ...super.getTagProps(record),
            img: `/web/image/${this.relation}/${record.resId}/avatar_128`,
        };
    }
}

export const listKanbanMany2ManyTagsAvatarField = {
    ...many2ManyTagsAvatarField,
    component: ListKanbanMany2ManyTagsAvatarField,
    extractProps: (fieldInfo) => ({
        ...many2ManyTagsAvatarField.extractProps(fieldInfo),
        itemsVisible: fieldInfo.viewType === "list" ? 5 : 3,
    }),
};

registry.category("fields").add("list.many2many_tags_avatar", listKanbanMany2ManyTagsAvatarField);
registry.category("fields").add("kanban.many2many_tags_avatar", listKanbanMany2ManyTagsAvatarField);
