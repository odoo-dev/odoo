/** @odoo-module alias=im_livechat.modelAddons.Thread.fieldAddons.isChatChannel **/

import fieldAddon from 'mail.model.field.addon.define';

export default fieldAddon({
    fieldName: 'isChatChannel',
    id: 'im_livechat.modelAddons.Thread.fieldAddons.isChatChannel',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {function} param0.original
     * @param {Thread} param0.record
     * @returns {boolean}
     */
    extendedCompute({ ctx, original, record }) {
        return (
            record.channelType(ctx) === 'livechat' ||
            original(record)
        );
    },
});
