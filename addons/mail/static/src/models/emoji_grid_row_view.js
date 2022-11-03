/** @odoo-module **/

import { registerModel } from '@mail/model/model_core';
import { attr, many, one } from '@mail/model/model_field';
import { clear } from '@mail/model/model_field_command';

registerModel({
    name: 'EmojiGridRowView',
    template: 'mail.EmojiGridRowView',
    fields: {
        emojiGridViewOwner: one('EmojiGridView', { related: 'emojiGridViewRowRegistryOwner.emojiGridViewOwner' }),
        index: attr({ identifying: true }),
        items: many('EmojiGridItemView', { inverse: 'emojiGridRowViewOwner' }),
        sectionView: one('EmojiGridSectionView', { inverse: 'emojiGridRowViewOwner',
            compute() {
                if (this.viewCategory) {
                    return {};
                }
                return clear();
            },
        }),
        emojiGridViewRowRegistryOwner: one('EmojiGridViewRowRegistry', { identifying: true, inverse: 'rows' }),
        viewCategory: one('EmojiPickerView.Category', { inverse: 'emojiGridRowView' }),
    },
});
