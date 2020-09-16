/** @odoo-module alias=mail.models.Discuss.actions.cancelThreadRenaming **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/cancelThreadRenaming',
    id: 'mail.models.Discuss.actions.cancelThreadRenaming',
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
                    'RecordFieldCommand/unlink',
                    thread,
                ),
            },
        );
    },
});
