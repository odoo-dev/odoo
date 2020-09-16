/** @odoo-module alias=mail.models.MessagingInitializer.actions._initCannedResponses **/

import action from 'mail.action.define';

export default action({
    name: 'MessagingInitializer/_initCannedResponses',
    id: 'mail.models.MessagingInitializer.actions._initCannedResponses',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {MessagingInitializer} messagingInitializer
     * @param {Object[]} cannedResponsesData
     */
    func(
        { ctx, env },
        messagingInitializer,
        cannedResponsesData
    ) {
        env.services.action.dispatch(
            'Record/update',
            messagingInitializer.messaging(ctx),
            {
                cannedResponses: env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    cannedResponsesData.map(
                        data => {
                            return {
                                id: data.id,
                                source: data.source,
                                substitution: data.substitution,
                            };
                        },
                    ),
                ),
            },
        );
    },
});