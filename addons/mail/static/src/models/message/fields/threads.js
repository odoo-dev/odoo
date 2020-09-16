/** @odoo-module alias=mail.models.Message.fields.threads **/

import many2many from 'mail.model.field.many2many.define';

/**
 * All threads that this message is linked to. This field is read-only.
 */
export default many2many({
    name: 'threads',
    id: 'mail.models.Message.fields.threads',
    global: true,
    target: 'Thread',
    inverse: 'messages',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Message} param0.record
     * @returns {Thread[]}
     */
    compute({ ctx, env, record }) {
        const threads = [...record.serverChannels(ctx)];
        if (record.isHistory(ctx)) {
            threads.push(env.services.model.messaging.history(ctx));
        }
        if (record.isNeedaction(ctx)) {
            threads.push(env.services.model.messaging.inbox(ctx));
        }
        if (record.isStarred(ctx)) {
            threads.push(env.services.model.messaging.starred(ctx));
        }
        if (
            env.services.model.messaging.moderation(ctx) &&
            record.isModeratedByCurrentPartner(ctx)
        ) {
            threads.push(env.services.model.messaging.moderation(ctx));
        }
        if (record.originThread(ctx)) {
            threads.push(record.originThread(ctx));
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            threads,
        );
    },
});
