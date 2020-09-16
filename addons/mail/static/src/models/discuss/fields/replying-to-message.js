/** @odoo-module alias=mail.models.Discuss.fields.replyingToMessage **/

import many2one from 'mail.model.field.many2one.define';

/**
 * The message that is currently selected as being replied to in Inbox.
 * There is only one reply composer shown at a time, which depends on
 * this selected message.
 */
export default many2one({
    name: 'replyingToMessage',
    id: 'mail.models.Discuss.fields.replyingToMessage',
    global: true,
    target: 'Message',
    /**
     * Ensures the reply feature is disabled if discuss is not open.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} param0.record
     * @returns {Message|undefined}
     */
    compute({ ctx, env, record }) {
        if (!record.isOpen(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/unlinkAll',
            );
        }
        return [];
    },
});
