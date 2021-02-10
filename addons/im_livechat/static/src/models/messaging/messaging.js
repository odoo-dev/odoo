odoo.define('im_livechat/static/src/models/messaging/messaging.js', function (require) {
'use strict';

const {
    registerFieldPatchModel,
    registerInstancePatchModel,
} = require('mail/static/src/model/model_core.js');
const { one2many } = require('mail/static/src/model/model_field.js');

registerInstancePatchModel('mail.messaging', 'im_livechat/static/src/models/messaging/messaging.js', {
    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @private
     * @returns [{mail.thread}]
     */
    _computeAllOrderedAndPinnedLivechats() {
        const livechats = this.allPinnedChannelThreads
            .filter(thread =>
                thread.channel_type === 'livechat'
            ).sort((t1, t2) => {
                if(t1.lastMessage && !t2.lastMessage) {
                    return 1;
                }
                if (t2.lastMessage && !t1.lastMessage) {
                    return -1;
                }
                if (t1.lastMessage && t2.lastMessage) {
                    return t2.lastMessage.id - t1.lastMessage.id;
                }
                return t1.id - t2.id;
            });
        return [['replace', livechats]];
    }
});

registerFieldPatchModel('mail.messaging', 'im_livechat/static/src/models/messaging/messaging.js', {
    allOrderedAndPinnedLivechats: one2many('mail.thread', {
        compute: '_computeAllOrderedAndPinnedLivechats',
        dependencies: ['allPinnedChannelThreads'],
    }),
});

});