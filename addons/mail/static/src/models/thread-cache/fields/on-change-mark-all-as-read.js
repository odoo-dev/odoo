/** @odoo-module alias=mail.models.ThreadCache.fields.onChangeMarkAllAsRead **/

import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to trigger its compute method when one of the
 * dependencies changes.
 */
export default attr({
    name: 'onChangeMarkAllAsRead',
    id: 'mail.models.ThreadCache.fields.onChangeMarkAllAsRead',
    global: true,
    dependencies: [
        'isMarkAllAsReadRequested',
    ],
    /**
     * Calls "mark all as read" when this thread becomes displayed in a
     * view (which is notified by `isMarkAllAsReadRequested` being `true`),
     * but delays the call until some other conditions are met, such as the
     * messages being loaded.
     * The reason to wait until messages are loaded is to avoid a race
     * condition because "mark all as read" will change the state of the
     * messages in parallel to fetch reading them.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     */
    compute({ ctx, env, record }) {
        if (
            !record.isMarkAllAsReadRequested(ctx) ||
            !record.thread(ctx) ||
            !record.thread(ctx).mainCache(ctx) ||
            !record.isLoaded(ctx) ||
            record.isLoading(ctx)
        ) {
            // wait for change of state before deciding what to do
            return;
        }
        env.services.action.dispatch(
            'Record/update',
            record,
            { isMarkAllAsReadRequested: false },
        );
        if (
            record.thread(ctx).isTemporary(ctx) ||
            record.thread(ctx).model(ctx) === 'mail.box' ||
            record.thread(ctx).mainCache(ctx) !== record ||
            record.threadViews(ctx).length === 0
        ) {
            // ignore the request
            return;
        }
        env.services.action.dispatch(
            'Message/markAllAsRead',
            [
                ['model', '=', record.thread(ctx).model(ctx)],
                ['res_id', '=', record.thread(ctx).id(ctx)],
            ],
        );
    },
});
