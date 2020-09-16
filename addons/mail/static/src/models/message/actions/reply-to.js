/** @odoo-module alias=mail.models.Message.actions.replyTo **/

import action from 'mail.action.define';

/**
 * Action to initiate reply to current message in Discuss Inbox. Assumes
 * that Discuss and Inbox are already opened.
 */
export default action({
    name: 'Message/replyTo',
    id: 'mail.models.Message.actions.replyTo',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} message
     */
    'Message/replyTo'(
        { ctx, env },
        message,
    ) {
        env.services.action.dispatch(
            'Discuss/replyToMessage',
            env.services.model.messaging.discuss(ctx),
            message,
        );
    },
});
