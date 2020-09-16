/** @odoo-module alias=mail.models.ChatWindowManager.fields._ordered **/

import attr from 'mail.model.field.attr.define';

/**
 * List of ordered chat windows (list of local ids)
 */
export default attr({
    name: '_ordered',
    id: 'mail.models.ChatWindowManager.fields._ordered',
    global: true,
    default: [],
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} param0.record
     * @returns {string[]}
     */
    compute({ ctx, env, record }) {
        // remove unlinked chatWindows
        const _ordered = record._ordered(ctx).filter(
            chatWindowLocalId => record.chatWindows(ctx).includes(
                env.services.action.dispatch(
                    'Record/get',
                    chatWindowLocalId,
                ),
            ),
        );
        // add linked chatWindows
        for (const chatWindow of record.chatWindows(ctx)) {
            if (!_ordered.includes(chatWindow.localId)) {
                _ordered.push(chatWindow.localId);
            }
        }
        return _ordered;
    },
});
