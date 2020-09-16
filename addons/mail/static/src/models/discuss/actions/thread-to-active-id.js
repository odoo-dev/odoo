/** @odoo-module alias=mail.models.Discuss.actions.threadToActiveId **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/threadToActiveId',
    id: 'mail.models.Discuss.actions.threadToActiveId',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Discuss} discuss
     * @param {Thread} thread
     * @returns {string}
     */
    func(
        { ctx },
        discuss,
        thread,
    ) {
        return `${thread.model(ctx)}_${thread.id(ctx)}`;
    },
});
