/** @odoo-module alias=mail.models.Discuss.actions.openThread **/

import action from 'mail.action.define';

/**
 * Opens the given thread in Discuss, and opens Discuss if necessary.
 */
export default action({
    name: 'Discuss/openThread',
    id: 'mail.models.Discuss.actions.openThread',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     * @param {Thread} thread
     */
    async func(
        { ctx, env },
        discuss,
        thread,
    ) {
        env.services.action.dispatch(
            'Record/update',
            discuss,
            {
                thread: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    thread,
                ),
            },
        );
        env.services.action.dispatch(
            'Discuss/focus',
            discuss,
        );
        if (!discuss.isOpen(ctx)) {
            env.bus.trigger('do-action', {
                action: 'mail.action_discuss',
                options: {
                    active_id: env.services.action.dispatch(
                        'Discuss/threadToActiveId',
                        discuss,
                        discuss.thread(ctx),
                    ),
                    clear_breadcrumbs: false,
                    on_reverse_breadcrumb: () =>
                        env.services.action.dispatch(
                            'Discuss/close',
                            discuss,
                        ),
                },
            });
        }
    },
});
