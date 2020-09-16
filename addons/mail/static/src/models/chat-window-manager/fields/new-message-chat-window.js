/** @odoo-module alias=mail.models.ChatWindowManager.fields.newMessageChatWindow **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'newMessageChatWindow',
    id: 'mail.models.ChatWindowManager.fields.newMessageChatWindow',
    global: true,
    target: 'ChatWindow',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} param0.record
     * @returns {ChatWindow|undefined}
     */
    compute({ ctx, env, record }) {
        const chatWindow = record.allOrdered(ctx).find(
            chatWindow => !chatWindow.thread(ctx),
        );
        if (!chatWindow) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            chatWindow,
        );
    },
});
