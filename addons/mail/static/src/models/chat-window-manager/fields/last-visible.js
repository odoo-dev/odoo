/** @odoo-module alias=mail.models.ChatWindowManager.fields.lastVisible **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'lastVisible',
    id: 'mail.models.ChatWindowManager.fields.lastVisible',
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
        const {
            length: l,
            [l - 1]: lastVisible,
        } = record.allOrderedVisible(ctx);
        if (!lastVisible) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/link',
            lastVisible,
        );
    },
});
