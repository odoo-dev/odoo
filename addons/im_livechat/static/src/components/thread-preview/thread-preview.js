/** @odoo-module alias=im_livechat.components.ThreadPreview **/

import ThreadPreview from 'mail.components.ThreadPreview';

import { patch } from 'web.utils';

patch(
    ThreadPreview.prototype,
    'im_livechat.components.ThreadPreview',
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
