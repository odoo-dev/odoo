/** @odoo-module **/

import { registerModel } from "@mail/model/model_core";
import { attr, many, one } from "@mail/model/model_field";

registerModel({
    name: "EmojiCategory",
    fields: {
        allEmojiInCategoryOfCurrent: many("EmojiInCategory", { inverse: "category" }),
        allEmojiPickerViewCategory: many("EmojiPickerView.Category", { inverse: "category" }),
        allEmojis: many("Emoji", { inverse: "emojiCategories" }),
        emojiRegistry: one("EmojiRegistry", {
            inverse: "allCategories",
            required: true,
            compute() {
                return this.messaging.emojiRegistry;
            },
        }),
        name: attr({ identifying: true }),
        sortId: attr({ readonly: true, required: true }),
        title: attr({ readonly: true, required: true }),
    },
});
