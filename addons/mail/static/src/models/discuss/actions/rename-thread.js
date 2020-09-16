/** @odoo-module alias=mail.models.Discuss.actions.renameThread **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/renameThread',
    id: 'mail.models.Discuss.actions.renameThread',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     * @param {Thread} thread
     * @param {string} newName
     */
    async func(
        { env },
        discuss,
        thread,
        newName,
    ) {
        await env.services.action.dispatch(
            'Record/doAsync',
            discuss,
            () => env.services.action.dispatch(
                'Thread/rename',
                thread,
                newName,
            ),
        );
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
