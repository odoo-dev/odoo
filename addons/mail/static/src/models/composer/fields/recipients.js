/** @odoo-module alias=mail.models.Composer.fields.recipients **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Determines the extra `Partner` (on top of existing followers)
 * that will receive the message being composed by `this`, and that will
 * also be added as follower of `this.thread`.
 */
export default many2many({
    name: 'recipients',
    id: 'mail.models.Composer.fields.recipients',
    global: true,
    target: 'Partner',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} param0.record
     * @returns {Partner[]}
     */
    compute({ ctx, env, record }) {
        if (
            record.thread(ctx) &&
            record.thread(ctx).model(ctx) === 'mail.channel'
        ) {
            // prevent from notifying/adding to followers non-members
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        const recipients = [...record.mentionedPartners(ctx)];
        if (record.thread(ctx) && !record.isLog(ctx)) {
            for (const recipient of record.thread(ctx).suggestedRecipientInfoList(ctx)) {
                if (recipient.partner(ctx) && recipient.isSelected(ctx)) {
                    recipients.push(recipient.partner(ctx));
                }
            }
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            recipients,
        );
    },
});
