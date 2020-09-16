/** @odoo-module alias=mail.models.Chatter.fields.hasThreadView **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determines whether `this.thread` should be displayed.
 */
export default attr({
    name: 'hasThreadView',
    id: 'mail.models.Chatter.fields.hasThreadView',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Chatter} param0.record
     * @returns {boolean}
     */
    compute({ ctx, record }) {
        return (
            record.thread(ctx) &&
            record.hasMessageList(ctx)
        );
    },
});
