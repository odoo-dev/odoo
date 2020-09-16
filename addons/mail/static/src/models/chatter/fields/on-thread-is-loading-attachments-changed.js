/** @odoo-module alias=mail.models.Chatter.fields.onThreadIsLoadingAttachmentsChanged **/

import attr from 'mail.model.fields.attr.define';

/**
 * Not a real field, used to trigger its compute method when one of the
 * dependencies changes.
 */
export default attr({
    name: 'onThreadIsLoadingAttachmentsChanged',
    id: 'mail.models.Chatter.fields.onThreadIsLoadingAttachmentsChanged',
    global: true,
    dependencies: [
        'threadIsLoadingAttachments',
    ],
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Chatter} param0.record
     */
    compute({ ctx, env, record }) {
        if (!record.thread(ctx).isLoadingAttachments(ctx)) {
            env.services.action.dispatch(
                'Chatter/_stopAttachmentsLoading',
                record,
            );
            return;
        }
        if (
            record._isPreparingAttachmentsLoading ||
            record.isShowingAttachmentsLoading(ctx)
        ) {
            return;
        }
        env.services.action.dispatch(
            'Chatter/_prepareAttachmentsLoading',
            record,
        );
    },
});
