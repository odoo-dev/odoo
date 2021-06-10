/** @odoo-module **/

import { registerInstancePatchModel } from '@mail/model/model_core';

registerInstancePatchModel('mail.discuss', 'im_livechat', {
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
