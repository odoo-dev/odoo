/** @odoo-module **/

import { registerInstancePatchModel } from '@mail/model/model_core';
import { replace } from '@mail/model/model_field_command';


registerInstancePatchModel('mail.discuss_sidebar_category', 'im_livechat/static/src/models/discuss_sidebar_category/discuss_sidebar_category.js', {

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     * @returns {integer}
     */
    _computeCounter() {
        if (this.supportedChannelType === 'livechat') {
            return this.selectedChannels.filter(thread => thread.localMessageUnreadCounter > 0).length;
        }
        return this._super();
    },

    /**
     * @override
     * @returns {string}
     */
    _computeDisplayName() {
        if (this.supportedChannelType === 'livechat') {
            return this.env._t('Livechat');
        }
        return this._super();
    },

    /**
     * @override
     * @returns {string}
     */
    _computeServerStateKey() {
        if (this.supportedChannelType === 'livechat') {
            return 'is_discuss_sidebar_category_livechat_open';
        }
        return this._super();

    },

    /**
     * @override
     * @returns {mail.thread[]}
     */
     _computeSelectedSortedChannels() {
        if (this.supportedChannelType === 'livechat') {
            return replace(this._sortByLastMeaningfulActionTime());
        }
        return this._super();
    },

    /**
     * @override
     * @returns {undefined}
     * @throws {Error}
     */
     _validateSupportedChannelType() {
        if (this.supportedChannelType === 'livechat') {
            return;
        }
        return this._super();
    }
});
