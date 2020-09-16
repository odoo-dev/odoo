/** @odoo-module alias=im_livechat.components.ThreadNeedactionPreview **/

import ThreadNeedactionPreview from 'mail.components.ThreadNeedactionPreview';

import { patch } from 'web.utils';

patch(
    ThreadNeedactionPreview.prototype,
    'im_livechat.components.ThreadNeedactionPreview',
    {
        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        image(...args) {
            if (this.thread.channelType(this) === 'livechat') {
                return '/mail/static/src/img/smiley/avatar.jpg';
            }
            return this._super(...args);
        },
    },
);
