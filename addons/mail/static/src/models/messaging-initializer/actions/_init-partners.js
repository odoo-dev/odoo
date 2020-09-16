/** @odoo-module alias=mail.models.MessagingInitializer.actions._initPartners **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingInitializer/_initPartners',
    id: 'mail.models.MessagingInitializer.actions._initPartners',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object} current_partner
     * @param {integer} current_user_id
     * @param {integer[]} moderation_channel_ids
     * @param {Object} partner_root
     * @param {Object[]} [public_partners=[]]
     */
    func(
        { ctx, env },
        messagingInitializer,
        {
            current_partner,
            current_user_id: currentUserId,
            moderation_channel_ids = [],
            partner_root,
            public_partners = [],
        },
    ) {
        env.services.action.dispatch(
            'Record/update',
            messagingInitializer.messaging(ctx),
            {
                currentPartner: env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        ...env.services.action.dispatch(
                            'Partner/convertData',
                            current_partner,
                        ),
                        moderatedChannels: env.services.action.dispatch(
                            'RecordFieldCommand/insert',
                            moderation_channel_ids.map(
                                id => {
                                    return {
                                        id,
                                        model: 'mail.channel',
                                    };
                                },
                            ),
                        ),
                        user: env.services.action.dispatch(
                            'RecordFieldCommand/insert', {
                            id: currentUserId,
                        }),
                    },
                ),
                currentUser: env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    { id: currentUserId },
                ),
                partnerRoot: env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    env.services.action.dispatch(
                        'Partner/convertData',
                        partner_root,
                    ),
                ),
                publicPartners: env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    public_partners.map(
                        data => env.services.action.dispatch(
                            'Partner/convertData',
                            data,
                        ),
                    ),
                ),
            },
        );
    },
});