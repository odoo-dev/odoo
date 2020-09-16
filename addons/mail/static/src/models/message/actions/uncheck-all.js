/** @odoo-module alias=mail.models.Message.actions.uncheckAll **/

import action from 'mail.action.define';

export default action({
    name: 'Message/uncheckAll',
    id: 'mail.models.Message.actions.uncheckAll',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} thread
     * @param {string} threadStringifiedDomain
     */
    func(
        { env },
        thread,
        threadStringifiedDomain
    ) {
        const threadCache = env.services.action.dispatch(
            'Thread/cache',
            thread,
            threadStringifiedDomain,
        );
        env.services.action.dispatch(
            'Record/update',
            threadCache,
            {
                checkedMessages: env.services.action.dispatch(
                    'RecordFieldCommand/unlink',
                    threadCache.messages(),
                ),
            },
        );
    },
});
