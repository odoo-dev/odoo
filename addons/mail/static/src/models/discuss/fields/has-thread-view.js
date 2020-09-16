/** @odoo-module alias=mail.models.Discuss.fields.hasThreadView **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether `this.thread` should be displayed.
 */
export default attr({
    name: 'hasThreadView',
    id: 'mail.models.Discuss.fields.hasThreadView',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} param0.record
     * @returns {boolean}
     */
    compute({ ctx, env, record }) {
        if (!record.thread(ctx) || !record.isOpen(ctx)) {
            return false;
        }
        if (
            env.services.model.messaging.device(ctx).isMobile(ctx) &&
            (
                record.activeMobileNavbarTabId(ctx) !== 'mailbox' ||
                record.thread(ctx).model(ctx) !== 'mail.box'
            )
        ) {
            return false;
        }
        return true;
    },
});
