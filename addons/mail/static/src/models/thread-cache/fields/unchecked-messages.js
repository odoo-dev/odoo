/** @odoo-module alias=mail.models.ThreadCache.fields.uncheckedMessages **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'uncheckedMessages',
    id: 'mail.models.ThreadCache.fields.uncheckedMessages',
    global: true,
    target: 'Message',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {Message[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/replace',
            record.messages(ctx).filter(
                message => (
                    message.hasCheckbox(ctx) &&
                    !record.checkedMessages(ctx).includes(message)
                ),
            ),
        );
    },
});
