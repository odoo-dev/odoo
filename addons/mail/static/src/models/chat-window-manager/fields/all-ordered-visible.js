/** @odoo-module alias=mail.models.ChatWindowManager.fields.allOrderedVisible **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'allOrderedVisible',
    id: 'mail.models.ChatWindowManager.fields.allOrderedVisible',
    global: true,
    target: 'ChatWindow',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} param0.record
     * @returns {ChatWindow[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.visual(ctx).visible.map(
                ({ chatWindowLocalId }) => env.services.action.dispatch(
                    'Record/get',
                    chatWindowLocalId,
                ),
            ),
        );
    },
});
