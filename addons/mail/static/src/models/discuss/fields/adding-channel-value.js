/** @odoo-module alias=mail.models.Discuss.fields.addingChannelValue **/

import attr from 'mail.model.field.attr.define';

/**
 * Value that is used to create a channel from the sidebar.
 */
export default attr({
    name: 'addingChannelValue',
    id: 'mail.models.Discuss.fields.addingChannelValue',
    global: true,
    default: "",
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Discuss} param0.record
     * @returns {string}
     */
     compute({ ctx, record }) {
        if (!record.isOpen(ctx)) {
            return "";
        }
        return record.addingChannelValue(ctx);
    },
});
