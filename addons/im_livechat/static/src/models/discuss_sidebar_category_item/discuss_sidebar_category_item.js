/** @odoo-module **/

import { registerInstancePatchModel } from '@mail/model/model_core';

registerInstancePatchModel('mail.discuss_sidebar_category_item', 'im_livechat/static/src/models/discuss_sidebar_category_item/discuss_sidebar_category_item.js', {

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     * @returns {string}
     */
    _computeAvatarUrl() {
        if (this.channelType === 'livechat') {
            if (this.correspondent && this.correspondent.id > 0) {
                return this.correspondentAvatarUrl;
            }
            return '/mail/static/src/img/smiley/avatar.jpg';
        }
        return this._super();
    },

    /**
     * @override
     * @returns {integer}
     */
    _computeCounter() {
        if (this.channelType === 'livechat') {
            return this.channelLocalMessageUnreadCounter;
        }
        return this._super();
    },

    /**
     * @override
     * @returns {boolean}
     */
    _computeHasUnpinCommand() {
        if (this.channelType === 'livechat') {
            return !this.channelLocalMessageUnreadCounter;
        }
        return this._super();
    },

    /**
     * @override
     * @returns {boolean}
     */
    _computeHasThreadIcon() {
        if (this.channelType === 'livechat') {
            return false;
        }
        return this._super();
    },

});
