/** @odoo-module alias=mail.models.Thread.fields.displayName **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'displayName',
    id: 'mail.models.Thread.fields.displayName',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Thread} param0.record
     * @returns {string}
     */
    compute({ ctx, record }) {
        if (
            record.channelType(ctx) === 'chat' &&
            record.correspondent(ctx)
        ) {
            return (
                record.customChannelName(ctx) ||
                record.correspondent(ctx).nameOrDisplayName(ctx)
            );
        }
        return record.name(ctx);
    },
});
