/** @odoo-module alias=mail.models.Thread.actions.unpin **/

import action from 'mail.action.define';

/**
 * Unpin this thread and notify server of the change.
 */
export default action({
    name: 'Thread/unpin',
    id: 'mail.models.Thread.actions.unpin',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
     async func(
        { env },
        thread,
    ) {
        env.services.action.dispatch(
            'Record/update',
            thread,
            { isPendingPinned: false },
        );
        await env.services.action.dispatch(
            'Thread/notifyPinStateToServer',
            thread,
        );
    },
});
