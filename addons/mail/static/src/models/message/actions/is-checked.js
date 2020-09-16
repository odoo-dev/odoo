/** @odoo-module alias=mail.models.Message.actions.isChecked **/

import action from 'mail.action.define';

export default action({
    name: 'Message/isChecked',
    id: 'mail.models.Message.actions.isChecked',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Message} message
     * @param {Thread} thread
     * @param {string} threadStringifiedDomain
     * @returns {boolean}
     */
    func(
        { ctx },
        message,
        thread,
        threadStringifiedDomain,
    ) {
        const relatedCheckedThreadCache = message.checkedThreadCaches(ctx).find(
            threadCache => (
                threadCache.thread(ctx) === thread &&
                threadCache.stringifiedDomain(ctx) === threadStringifiedDomain
            ),
        );
        return !!relatedCheckedThreadCache;
    },
});
