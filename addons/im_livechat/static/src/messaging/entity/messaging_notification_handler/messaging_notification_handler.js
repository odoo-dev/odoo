odoo.define('im_livechat.messaging.entity.MessagingNotificationHandler', function (require) {
'use strict';

const { registerInstancePatchEntity } = require('mail.messaging.entityCore');

registerInstancePatchEntity('MessagingNotificationHandler', 'im_livechat.messaging.entity.MessagingNotificationHandler', {

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     * @param {Object} param0
     * @param {integer} param0.channelId
     * @param {integer} param0.partner_id
     */
    _handleNotificationChannelTypingStatus(data) {
        const { channelId, partner_id } = data;
        const channel = this.env.entities.Thread.insert({ id: channelId, model: 'mail.channel' });
        let partnerId;
        if (partner_id === this.env.messaging.publicPartner.id) {
            // Some shenanigans that this is a typing notification
            // from public partner.
            partnerId = channel.correspondent.id;
        } else {
            partnerId = partner_id;
        }
        this._super(Object.assign(data, {
            partner_id: partnerId,
        }));
    },
});

});
