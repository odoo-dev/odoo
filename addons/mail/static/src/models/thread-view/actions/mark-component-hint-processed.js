/** @odoo-module alias=mail.models.ThreadView.actions.markComponentHintProcessed **/

import action from 'mail.action.define';

export default action({
    name: 'ThreadView/markComponentHintProcessed',
    id: 'mail.models.ThreadView.actions.markComponentHintProcessed',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadView} threadView
     * @param {Object} hint
     */
    func(
        { ctx, env },
        threadView,
        hint,
    ) {
        env.services.action.dispatch(
            'Record/update',
            threadView,
            {
                componentHintList: threadView.componentHintList(ctx).filter(
                    h => h !== hint,
                ),
            },
        );
        env.services.model.messagingBus.trigger(
            'o-thread-view-hint-processed',
            {
                hint,
                threadViewer: threadView.threadViewer(ctx),
            },
        );
    },
});
