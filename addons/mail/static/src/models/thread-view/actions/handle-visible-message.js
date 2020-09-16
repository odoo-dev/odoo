/** @odoo-module alias=mail.models.ThreadView.actions.handleVisibleMessage **/

import action from 'mail.action.define';

export default action({
    name: 'ThreadView/handleVisibleMessage',
    id: 'mail.models.ThreadView.actions.handleVisibleMessage',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadView} threadView
     * @param {Message} message
     */
    func(
        { ctx, env },
        threadView,
        message,
    ) {
        if (
            !threadView.lastVisibleMessage(ctx) ||
            threadView.lastVisibleMessage(ctx).id(ctx) < message.id(ctx)
        ) {
            env.services.action.dispatch(
                'Record/update',
                threadView,
                {
                    lastVisibleMessage: env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        message,
                    ),
                },
            );
        }
    },
});
