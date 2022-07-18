/** @odoo-module **/

import { patchRecordMethods } from '@mail/model/model_core';
// ensure that the model definition is loaded before the patch
import '@mail/models/discuss_sidebar_category_item';

patchRecordMethods('DiscussSidebarCategoryItem', {
    /**
     * @override
     */
    _computeAvatarUrl() {
        if (this.channel.channel.channel_type === 'livechat') {
            if (this.channel.channel.correspondent && this.channel.channel.correspondent.id > 0) {
                return this.channel.channel.correspondent.avatarUrl;
            }
        }
        return this._super();
    },
    /**
     * @override
     */
    _computeCategoryCounterContribution() {
        switch (this.channel.channel.channel_type) {
            case 'livechat':
                return this.channel.localMessageUnreadCounter > 0 ? 1 : 0;
        }
        return this._super();
    },
    /**
     * @override
     */
    _computeCounter() {
        if (this.channel.channel.channel_type === 'livechat') {
            return this.channel.localMessageUnreadCounter;
        }
        return this._super();
    },
    /**
     * @override
     */
    _computeHasUnpinCommand() {
        if (this.channel.channel.channel_type === 'livechat') {
            return !this.channel.localMessageUnreadCounter;
        }
        return this._super();
    },
    /**
     * @override
     */
    _computeHasThreadIcon() {
        if (this.channel.channel.channel_type === 'livechat') {
            return false;
        }
        return this._super();
    },
});
