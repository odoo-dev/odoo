/** @odoo-module alias=mail.models.ThreadCache.fields.checkedMessages **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'checkedMessages',
    id: 'mail.models.ThreadCache.fields.checkedMessages',
    global: true,
    target: 'Message',
    inverse: 'checkedThreadCaches',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {Message[]}
     */
    compute({ ctx, env, record }) {
        const messagesWithoutCheckbox = record.checkedMessages(ctx).filter(
            message => !message.hasCheckbox(ctx),
        );
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
            messagesWithoutCheckbox,
        );
    },
});
