/** @odoo-module alias=mail.models.Thread.fields.typingStatusText **/

import attr from 'mail.model.field.attr.define';

/**
 * Text that represents the status on this thread about typing members.
 */
export default attr({
    name: 'typingStatusText',
    id: 'mail.models.Thread.fields.typingStatusText',
    global: true,
    default: "",
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     * @returns {string}
     */
    compute({ ctx, env, record }) {
        if (record.orderedOtherTypingMembers(ctx).length === 0) {
            return record.constructor.fields.get('typingStatusText').default;
        }
        if (record.orderedOtherTypingMembers(ctx).length === 1) {
            return _.str.sprintf(
                env._t("%s is typing..."),
                record.orderedOtherTypingMembers(ctx)[0].nameOrDisplayName(ctx),
            );
        }
        if (record.orderedOtherTypingMembers(ctx).length === 2) {
            return _.str.sprintf(
                env._t("%s and %s are typing..."),
                record.orderedOtherTypingMembers(ctx)[0].nameOrDisplayName(ctx),
                record.orderedOtherTypingMembers(ctx)[1].nameOrDisplayName(ctx),
            );
        }
        return _.str.sprintf(
            env._t("%s, %s and more are typing..."),
            record.orderedOtherTypingMembers(ctx)[0].nameOrDisplayName(ctx),
            record.orderedOtherTypingMembers(ctx)[1].nameOrDisplayName(ctx),
        );
    },
});
