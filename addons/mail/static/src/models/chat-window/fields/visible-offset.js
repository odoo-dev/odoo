/** @odoo-module alias=mail.models.ChatWindow.fields.visibleOffset **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'visibleOffset',
    id: 'mail.models.ChatWindow.fields.visibleOffset',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ChatWindow} param0.record
     * @returns {integer}
     */
    compute({ ctx, record }) {
        if (!record.manager(ctx)) {
            return 0;
        }
        const visible = record.manager(ctx).visual(ctx).visible;
        const index = visible.findIndex(
            visible => visible.chatWindowLocalId === record.localId,
        );
        if (index === -1) {
            return 0;
        }
        return visible[index].offset;
    },
});
