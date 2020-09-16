/** @odoo-module alias=mail.models.Thread.fields.lastNeedactionMessageAsOrigin **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'lastNeedactionMessageAsOrigin',
    id: 'mail.models.Thread.fields.lastNeedactionMessageAsOrigin',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Message|undefined}
     */
    compute({ ctx, env, record }) {
        const orderedNeedactionMessagesAsOriginThread =
            record.needactionMessagesAsOriginThread(ctx).sort(
                (m1, m2) => m1.id(ctx) < m2.id(ctx) ? -1 : 1,
            );
        const {
            length: l,
            [l - 1]: lastNeedactionMessageAsOriginThread,
        } = orderedNeedactionMessagesAsOriginThread;
        if (lastNeedactionMessageAsOriginThread) {
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                lastNeedactionMessageAsOriginThread,
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
        );
    },
});
