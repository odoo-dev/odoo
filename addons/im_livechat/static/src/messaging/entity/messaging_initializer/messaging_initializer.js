odoo.define('im_livechat.messaging.entity.MessagingInitializer', function (require) {
'use strict';

const { registerInstancePatchEntity } = require('mail.messaging.entityCore');

registerInstancePatchEntity('MessagingInitializer', 'im_livechat.messaging.entity.MessagingInitializer', {

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     * @param {Object[]} [param0.channel_livechat=[]]
     */
    _initChannels(initMessagingData) {
        this._super(initMessagingData);
        const { channel_livechat = [] } = initMessagingData;
        for (const data of channel_livechat) {
            this.env.entities.Thread.insert(Object.assign(
                {},
                this.env.entities.Thread.convertData(data),
                { isPinned: true }
            ));
        }
    },
});

});
