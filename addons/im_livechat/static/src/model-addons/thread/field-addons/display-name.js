/** @odoo-module alias=im_livechat.modelAddons.Thread.fieldAddons.displayName **/

import fieldAddon from 'mail.model.field.addon.define';

export default fieldAddon({
    fieldName: 'displayName',
    id: 'im_livechat.modelAddons.Thread.fieldAddons.displayName',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {function} param0.original
     * @param {Thread} param0.record
     * @returns {string}
     */
    extendedCompute({ ctx, original, record }) {
        if (
            record.channelType(ctx) === 'livechat' &&
            record.correspondent(ctx)
        ) {
            if (record.correspondent(ctx).country(ctx)) {
                return `${
                    record.correspondent(ctx).nameOrDisplayName(ctx)
                } (${
                    record.correspondent(ctx).country(ctx).name(ctx)
                })`;
            }
            return record.correspondent(ctx).nameOrDisplayName(ctx);
        }
        return original(record);
    },
});
