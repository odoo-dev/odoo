/** @odoo-module alias=mail.models.Thread.fields.correspondent **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'correspondent',
    id: 'mail.models.Thread.fields.correspondent',
    global: true,
    target: 'Partner',
    inverse: 'correspondentThreads',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {Partner}
     */
    compute({ ctx, env, record }) {
        if (record.channelType(ctx) === 'channel') {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        const correspondents = record.members(ctx).filter(
            partner => partner !== env.services.model.messaging.currentPartner(ctx),
        );
        if (correspondents.length === 1) {
            // 2 members chat
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                correspondents[0],
            );
        }
        if (record.members(ctx).length === 1) {
            // chat with oneself
            return env.services.action.dispatch(
                'RecordFieldCommand/link',
                record.members(ctx)[0],
            );
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
        );
    },
});
