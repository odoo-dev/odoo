/** @odoo-module alias=mail.models.Chatter.fields.onThreadIdOrThreadModelChanged **/

import attr from 'mail.model.fields.attr.define';

const _getThreadNextTemporaryId = (function () {
    let tmpId = 0;
    return () => {
        tmpId -= 1;
        return tmpId;
    };
})();
const _getMessageNextTemporaryId = (function () {
    let tmpId = 0;
    return () => {
        tmpId -= 1;
        return tmpId;
    };
})();

/**
 * Not a real field, used to trigger its compute method when one of the
 * dependencies changes.
 */
export default attr({
    name: 'onThreadIdOrThreadModelChanged',
    id: 'mail.models.Chatter.fields.onThreadIdOrThreadModelChanged',
    global: true,
    dependencies: [
        'threadId',
        'threadModel',
    ],
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Chatter} param0.record
     */
    compute({ ctx, env, record }) {
        if (record.threadId(ctx)) {
            if (
                record.thread(ctx) &&
                record.thread(ctx).isTemporary(ctx)
            ) {
                env.services.action.dispatch(
                    'Record/delete',
                    record.thread(ctx),
                );
            }
            env.services.action.dispatch(
                'Record/update',
                record,
                {
                    isAttachmentBoxVisible:
                        record.isAttachmentBoxVisibleInitially(ctx),
                    thread: env.services.action.dispatch(
                        'RecordFieldCommand/insert',
                        {
                            // If the thread was considered to have the activity
                            // mixin once, it will have it forever.
                            hasActivities: record.hasActivities(ctx)
                                ? true
                                : undefined,
                            id: record.threadId(ctx),
                            model: record.threadModel(ctx),
                        },
                    ),
                },
            );
            if (record.hasActivities(ctx)) {
                env.services.action.dispatch(
                    'Thread/refreshActivities',
                    record.thread(ctx),
                );
            }
            if (record.hasFollowers(ctx)) {
                env.services.action.dispatch(
                    'Thread/refreshFollowers',
                    record.thread(ctx),
                );
                env.services.action.dispatch(
                    'Thread/fetchAndUpdateSuggestedRecipients',
                    record.thread(ctx),
                );
            }
            if (record.hasMessageList(ctx)) {
                env.services.action.dispatch(
                    'Thread/refresh',
                    record.thread(ctx),
                );
            }
        } else if (
            !record.thread(ctx) ||
            !record.thread(ctx).isTemporary(ctx)
        ) {
            const currentPartner = env.services.model.messaging.currentPartner(ctx);
            const message = env.services.action.dispatch(
                'Message/create',
                {
                    author: env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        currentPartner,
                    ),
                    body: env._t("Creating a new record..."),
                    id: _getMessageNextTemporaryId(),
                    isTemporary: true,
                },
            );
            const nextId = _getThreadNextTemporaryId();
            env.services.action.dispatch(
                'Record/update',
                record,
                {
                    isAttachmentBoxVisible: false,
                    thread: env.services.action.dispatch(
                        'RecordFieldCommand/insert',
                        {
                            areAttachmentsLoaded: true,
                            id: nextId,
                            isTemporary: true,
                            model: record.threadModel(ctx),
                        },
                    ),
                },
            );
            for (const cache of record.thread(ctx).caches(ctx)) {
                env.services.action.dispatch(
                    'Record/update',
                    cache,
                    {
                        messages: env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            message,
                        ),
                    },
                );
            }
        }
    },
});
