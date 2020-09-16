/** @odoo-module alias=mail.models.ThreadView.fields.onThreadShouldBeSetAsSeen **/

import RecordDeletedError from 'mail.classes.RecordDeletedError';
import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to trigger `thread.markAsSeen` when one of
 * the dependencies changes.
 */
export default attr({
    name: 'onThreadShouldBeSetAsSeen',
    id: 'mail.models.ThreadView.fields.onThreadShouldBeSetAsSeen',
    global: true,
    dependencies: [
        'hasComposerFocus',
        'lastMessage',
        'lastNonTransientMessage',
        'lastVisibleMessage',
        'threadCache',
    ],
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadView} param0.record
     */
     compute({ ctx, env, record }) {
        if (!record.thread(ctx)) {
            return;
        }
        if (!record.thread(ctx).lastNonTransientMessage(ctx)) {
            return;
        }
        if (!record.lastVisibleMessage(ctx)) {
            return;
        }
        if (
            !record.lastVisibleMessage(ctx) !==
            record.lastMessage(ctx)
        ) {
            return;
        }
        if (!record.hasComposerFocus(ctx)) {
            // FIXME condition should not be on "composer is focused" but
            // "threadView is active"
            // See task-2277543
            return;
        }
        env.services.action.dispatch(
            'Thread/markAsSeen',
            record.thread(ctx),
            record.thread(ctx).lastNonTransientMessage(ctx),
        ).catch(
            e => {
                // prevent crash when executing compute during destroy
                if (!(e instanceof RecordDeletedError)) {
                    throw e;
                }
            },
        );
    },
});
