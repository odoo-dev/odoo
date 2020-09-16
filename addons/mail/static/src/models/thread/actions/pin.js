/** @odoo-module alias=mail.models.Thread.actions.pin **/

import action from 'mail.action.define';

/**
 * Pin this thread and notify server of the change.
 */
export default action({
    name: 'Thread/pin',
    id: 'mail.models.Thread.actions.pin',
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
            { isPendingPinned: true },
        );
        await env.services.action.dispatch(
            'Thread/notifyPinStateToServer',
            thread,
        );
    },
});
