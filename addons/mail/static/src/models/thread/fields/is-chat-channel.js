/** @odoo-module alias=mail.models.Thread.fields.isChatChannel **/

import attr from 'mail.model.field.attr.define';

/**
 * States whether this thread is a `mail.channel` qualified as chat.
 *
 * Useful to list chat channels, like in messaging menu with the filter
 * 'chat'.
 */
export default attr({
    name: 'isChatChannel',
    id: 'mail.models.Thread.fields.isChatChannel',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Thread} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return record.channelType(ctx) === 'chat';
    },
});
