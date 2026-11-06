import { registry } from "@web/core/registry";
import {
    Many2ManyTagsField,
    many2ManyTagsField,
} from "@web/views/fields/many2many_tags/many2many_tags_field";

/**
 * Editable tags field for the media card dropdown menu.
 *
 * Card records are never "in edition" and only `record.update()` saves them
 * automatically, whereas the tags field edits the x2many list directly. Like
 * `Many2ManyTagsAvatarFieldPopover`, we save the record after each change so
 * the tags are written to the server right away.
 */
export class MediaTagsField extends Many2ManyTagsField {
    setup() {
        super.setup();
        const update = this.update;
        this.update = async (recordList) => {
            await update(recordList);
            await this.saveRecord();
        };
        if (this.quickCreate) {
            const quickCreate = this.quickCreate;
            this.quickCreate = async (name) => {
                await quickCreate(name);
                await this.saveRecord();
            };
        }
    }

    async deleteTag(id) {
        await super.deleteTag(id);
        await this.saveRecord();
    }

    saveRecord() {
        return this.props.record.save({ reload: false });
    }
}

/**
 * In the media manager kanban, every field is readonly: card records are never
 * "in edition", and the view is declared with `edit="false"` so the other card
 * fields stay read-only. This widget is only meant to tag media from the card
 * menu, so it is always editable (write access is still checked server side).
 */
export const mediaTagsField = {
    ...many2ManyTagsField,
    component: MediaTagsField,
    extractProps() {
        return {
            ...many2ManyTagsField.extractProps(...arguments),
            readonly: false,
        };
    },
};

registry.category("fields").add("media_tags", mediaTagsField);
