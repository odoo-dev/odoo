/** @odoo-module **/

import {
    registerFieldPatchModel,
    registerInstancePatchModel,
} from '@mail/model/model_core';
import { one2one } from '@mail/model/model_field';

registerInstancePatchModel('mail.discuss', 'im_livechat/static/src/models/discuss/discuss.js', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     * @param {String} value
     */
    onInputQuickSearch(value) {
        if (!this.sidebarQuickSearchValue) {
            this.categoryLivechat.open();
        }
        return this._super(value);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------
    /**
     * @override
     */
    _computeHasInviteButton() {
        if (this.thread && this.thread.channel_type === 'livechat') {
            return true;
        }
        return this._super();
    },

});

registerFieldPatchModel('mail.discuss', 'im_livechat/static/src/models/discuss/discuss.js', {
    /**
     * Discuss sidebar category for `livechat` channel threads.
     */
    categoryLivechat: one2one('mail.discuss_sidebar_category', {
        isCausal: true,
    }),
});
