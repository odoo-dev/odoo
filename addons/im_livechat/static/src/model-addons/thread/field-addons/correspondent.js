/** @odoo-module alias=im_livechat.modelAddons.Thread.fieldAddons.correspondent **/

import fieldAddon from 'mail.model.field.addon.define';

export default fieldAddon({
    fieldName: 'correspondent',
    id: 'im_livechat.modelAddons.Thread.fieldAddons.correspondent',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {function} param0.original
     * @param {Thread} param0.record
     * @returns {Partner}
     */
    extendedCompute({ ctx, original, record }) {
        if (record.channelType(ctx) === 'livechat') {
            // livechat correspondent never change: always the public member.
            return [];
        }
        return original(record);
    },
});
