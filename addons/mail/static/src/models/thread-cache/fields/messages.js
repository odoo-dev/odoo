/** @odoo-module alias=mail.models.ThreadCache.fields.messages **/

import many2many from 'mail.model.field.many2many.define';

/**
 * List of messages linked to this cache.
 */
export default many2many({
    name: 'messages',
    id: 'mail.models.ThreadCache.fields.messages',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {Message[]}
     */
    compute({ ctx, env, record }) {
        if (!record.thread(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        let messages = record.fetchedMessages(ctx);
        if (record.stringifiedDomain(ctx) !== '[]') {
            return env.services.action.dispatch(
                'RecordFieldCommand/replace',
                messages,
            );
        }
        // main cache: adjust with newer messages
        let newerMessages;
        if (!record.lastFetchedMessage(ctx)) {
            newerMessages = record.thread(ctx).messages(ctx);
        } else {
            newerMessages = record.thread(ctx).messages(ctx).filter(
                message => message.id(ctx) > record.lastFetchedMessage(ctx).id(ctx),
            );
        }
        messages = messages.concat(newerMessages);
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            messages,
        );
    },
});
