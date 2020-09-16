/** @odoo-module alias=mail.models.Message.actions.toggleCheck **/

import action from 'mail.action.define';

/**
 * Toggle check state of this message in the context of the provided
 * thread and its stringifiedDomain.
 */
export default action({
    name: 'Message/toggleCheck',
    id: 'mail.models.Message.actions.toggleCheck',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} message
     * @param {Thread} thread
     * @param {string} threadStringifiedDomain
     */
    func(
        { ctx, env },
        message,
        thread,
        threadStringifiedDomain,
    ) {
        const threadCache = env.services.action.dispatch(
            'Thread/cache',
            thread,
            threadStringifiedDomain,
        );
        if (threadCache.checkedMessages(ctx).includes(message)) {
            env.services.action.dispatch(
                'Record/update',
                threadCache,
                {
                    checkedMessages: env.services.action.dispatch(
                        'RecordFieldCommand/unlink',
                        message,
                    ),
                },
            );
        } else {
            env.services.action.dispatch(
                'Record/update',
                threadCache,
                {
                    checkedMessages: env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        message,
                    ),
                },
            );
        }
    },
});
