/** @odoo-module alias=mail.models.ThreadCache.fields.onHasToLoadMessagesChanged **/

import attr from 'mail.model.field.attr.define';

/**
 * Loads initial messages from `this`.
 * This is not a "real" field, its compute function is used to trigger
 * the load of messages at the right time.
 */
export default attr({
    name: 'onHasToLoadMessagesChanged',
    id: 'mail.models.ThreadCache.fields.onHasToLoadMessagesChanged',
    global: true,
    dependencies: [
        'hasToLoadMessages',
    ],
    /**
     * Loads this thread cache, by fetching the most recent messages in this
     * conversation.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     */
    async compute({ ctx, env, record }) {
        if (!record.hasToLoadMessages(ctx)) {
            return;
        }
        const fetchedMessages = await env.services.action.dispatch(
            'Record/doAsync',
            record,
            () => env.services.action.dispatch(
                'ThreadCache/_loadMessages',
                record,
            )
        );
        for (const threadView of record.threadViews(ctx)) {
            env.services.action.dispatch(
                'ThreadView/addComponentHint',
                threadView,
                'messages-loaded',
                { fetchedMessages },
            );
        }
    },
});
