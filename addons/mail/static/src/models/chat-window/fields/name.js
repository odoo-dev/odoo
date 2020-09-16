/** @odoo-module alias=mail.models.ChatWindow.fields.name **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'name',
    id: 'mail.models.ChatWindow.fields.name',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindow} param0.record
     * @returns {string}
     */
    compute({ ctx, env, record }) {
        if (record.thread(ctx)) {
            return record.thread(ctx).displayName(ctx);
        }
        return env._t("New message");
    },
});
