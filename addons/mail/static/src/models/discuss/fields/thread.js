/** @odoo-module alias=mail.models.Discuss.fields.thread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Determines the `Thread` that should be displayed by `this`.
 *
 * Only pinned threads are allowed in discuss.
 */
export default many2one({
    name: 'thread',
    id: 'mail.models.Discuss.fields.thread',
    global: true,
    target: 'Thread',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} param0.record
     * @returns {Thread|undefined}
     */
    compute({ ctx, env, record }) {
        let thread = record.thread(ctx);
        if (
            env.services.model.messaging &&
            env.services.model.messaging.inbox(ctx) &&
            env.services.model.messaging.device(ctx).isMobile(ctx) &&
            record.activeMobileNavbarTabId(ctx) === 'mailbox' &&
            record.initActiveId(ctx) !== 'mail.box_inbox' &&
            !thread
        ) {
            // After loading Discuss from an arbitrary tab other then 'mailbox',
            // switching to 'mailbox' requires to also set its inner-tab ;
            // by default the 'inbox'.
            return env.services.action.dispatch(
                'RecordFieldCommand/replace',
                env.services.model.messaging.inbox(ctx),
            );
        }
        if (!thread || !thread.isPinned(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlink',
            );
        }
        return [];
    },
});
