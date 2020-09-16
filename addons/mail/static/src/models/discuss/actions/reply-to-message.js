/** @odoo-module alias=mail.models.Discuss.actions.replyToMessage **/

import action from 'mail.action.define';

/**
 * Action to initiate reply to given message in Inbox. Assumes that
 * Discuss and Inbox are already opened.
 */
export default action({
    name: 'Discuss/replyToMessage',
    id: 'mail.models.Discuss.actions.replyToMessage',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     * @param {Message} message
     */
    func(
        { ctx, env },
        discuss,
        message,
    ) {
        env.services.action.dispatch(
            'Record/update',
            discuss,
            {
                replyingToMessage: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    message,
                ),
            },
        );
        // avoid to reply to a note by a message and vice-versa.
        // subject to change later by allowing subtype choice.
        env.services.action.dispatch(
            'Record/update',
            discuss.replyingToMessageOriginThreadComposer(ctx),
            {
                isLog: (
                    !message.isDiscussion(ctx) &&
                    !message.isNotification(ctx)
                ),
            },
        );
        env.services.action.dispatch(
            'Discuss/focus',
            discuss,
        );
    },
});
