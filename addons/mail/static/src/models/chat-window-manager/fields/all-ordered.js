/** @odoo-module alias=mail.models.ChatWindowManager.fields.allOrdered **/

import one2many from 'mail.model.field.one2many.define';

// FIXME: dependent on implementation that uses arbitrary order in relations!!
export default one2many({
    name: 'allOrdered',
    id: 'mail.models.ChatWindowManager.fields.allOrdered',
    global: true,
    target: 'ChatWindow',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} param0.record
     * @returns {ChatWindow}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record._ordered(ctx).map(
                chatWindowLocalId => env.services.action.dispatch(
                    'Record/get',
                    chatWindowLocalId,
                ),
            ),
        );
    },
});
