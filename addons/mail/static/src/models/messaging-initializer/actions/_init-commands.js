/** @odoo-module alias=mail.models.MessagingInitializer.actions._initCommands **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingInitializer/_initCommands',
    id: 'mail.models.MessagingInitializer.actions._initCommands',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object[]} commandsData
     */
    func(
        { ctx, env },
        messagingInitializer,
        commandsData,
    ) {
        env.services.action.dispatch(
            'Record/update',
            messagingInitializer.messaging(ctx),
            {
                commands: env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    commandsData.map(
                        data => {
                            return {
                                channelTypes: data.channel_types,
                                help: data.help,
                                name: data.name,
                            };
                        },
                    ),
                ),
            },
        );
    },
});