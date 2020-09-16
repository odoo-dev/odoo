/** @odoo-module alias=mail.models.MessagingInitializer.actions._init **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingInitializer/_init',
    id: 'mail.models.MessagingInitializer.actions._init',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object} param2
     * @param {Object} param2.channel_slots
     * @param {Array} [param2.commands=[]]
     * @param {Object} param2.current_partner
     * @param {integer} param2.current_user_id
     * @param {Object} [param2.mail_failures={}]
     * @param {Object[]} [param2.mention_partner_suggestions=[]]
     * @param {Object[]} [param2.moderation_channel_ids=[]]
     * @param {integer} [param2.moderation_counter=0]
     * @param {integer} [param2.needaction_inbox_counter=0]
     * @param {Object} param2.partner_root
     * @param {Object[]} param2.public_partners
     * @param {Object[]} [param2.shortcodes=[]]
     * @param {integer} [param2.starred_counter=0]
     */
    async func(
        { ctx, env },
        messagingInitializer,
        {
            channel_slots,
            commands = [],
            current_partner,
            current_user_id,
            mail_failures = {},
            mention_partner_suggestions = [],
            menu_id,
            moderation_channel_ids = [],
            moderation_counter = 0,
            needaction_inbox_counter = 0,
            partner_root,
            public_partners,
            shortcodes = [],
            starred_counter = 0
        }
    ) {
        const discuss = messagingInitializer.messaging(ctx).discuss(ctx);
        // partners first because the rest of the code relies on them
        env.services.action.dispatch(
            'MessagingInitializer/_initPartners',
            messagingInitializer,
            {
                current_partner,
                current_user_id,
                moderation_channel_ids,
                partner_root,
                public_partners,
            },
        );
        // mailboxes after partners and before other initializers that might
        // manipulate threads or messages
        env.services.action.dispatch(
            'MessagingInitializer/_initMailboxes',
            messagingInitializer,
            {
                moderation_channel_ids,
                moderation_counter,
                needaction_inbox_counter,
                starred_counter,
            },
        );
        // various suggestions in no particular order
        env.services.action.dispatch(
            'MessagingInitializer/_initCannedResponses',
            messagingInitializer,
            shortcodes,
        );
        env.services.action.dispatch(
            'MessagingInitializer/_initCommands',
            messagingInitializer,
            commands,
        );
        env.services.action.dispatch(
            'MessagingInitializer/_initMentionPartnerSuggestions',
            messagingInitializer,
            mention_partner_suggestions,
        );
        // channels when the rest of messaging is ready
        await env.services.action.dispatch(
            'Record/doAsync',
            messagingInitializer,
            () => env.services.action.dispatch(
                'MessagingInitializer/_initChannels',
                messagingInitializer,
                channel_slots,
            ),
        );
        // failures after channels
        env.services.action.dispatch(
            'MessagingInitializer/_initMailFailures',
            messagingInitializer,
            mail_failures,
        );
        env.services.action.dispatch(
            'Record/update',
            discuss,
            { menuId: menu_id },
        );
    },
});