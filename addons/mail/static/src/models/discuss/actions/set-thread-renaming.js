/** @odoo-module alias=mail.models.Discuss.actions.setThreadRenaming **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/setThreadRenaming',
    id: 'mail.models.Discuss.actions.setThreadRenaming',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     * @param {Thread} thread
     */
    func(
        { env },
        discuss,
        thread,
    ) {
        env.services.action.dispatch(
            'Record/update',
            discuss,
            {
                renamingThreads: env.services.action.dispatch(
                    'RecordFieldComamnd/link',
                    thread,
                ),
            },
        );
    },
});
