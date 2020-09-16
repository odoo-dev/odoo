/** @odoo-module alias=mail.models.ThreadPartnerSeenInfo.fields.partner **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Partner that this seen info is related to.
 *
 * Should not write on this field to update relation, and instead
 * should write on @see partnerId field.
 */
export default many2one({
    name: 'partner',
    id: 'mail.models.ThreadPartnerSeenInfo.fields.partner',
    global: true,
    target: 'Partner',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadPartnerSeenInfo} param0.record
     * @returns {Partner|undefined}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/insert',
            { id: record.partnerId(ctx) },
        );
    },
});
