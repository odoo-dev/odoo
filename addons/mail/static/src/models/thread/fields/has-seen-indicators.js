/** @odoo-module alias=mail.models.Thread.fields.hasSeenIndicators **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether this thread has the seen indicators (V and VV)
 * enabled or not.
 */
export default attr({
    name: 'hasSeenIndicators',
    id: 'mail.models.Thread.fields.hasSeenIndicators',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Thread} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        if (record.model(ctx) !== 'mail.channel') {
            return false;
        }
        if (record.isMassMailing(ctx)) {
            return false;
        }
        return ['chat', 'livechat'].includes(record.channelType(ctx));
    },
});
