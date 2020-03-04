odoo.define('im_livechat.component.ThreadPreview', function (require) {
'use strict';

const ThreadPreview = require('mail.component.ThreadPreview');

const { patch } = require('web.utils');

patch(ThreadPreview, 'im_livechat_thread_preview', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    getImage(...args) {
        if (this.storeProps.thread.channel_type === 'livechat') {
            return '/mail/static/src/img/smiley/avatar.jpg';
        }
        return this._super(...args);
    }

});

});
