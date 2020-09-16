/** @odoo-module alias=mail.models.Discuss.fields.isAddingChat **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether current user is currently adding a chat from
 * the sidebar.
 */
export default attr({
    name: 'isAddingChat',
    id: 'mail.models.Discuss.fields.isAddingChat',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Discuss} param0.record
     * @returns {boolean}
     */
     compute({ ctx, record }) {
        if (!record.isOpen(ctx)) {
            return false;
        }
        return record.isAddingChat(ctx);
    },
});
