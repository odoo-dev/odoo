/** @odoo-module alias=mail.models.Composer.fields.extraSuggestedPartners **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Ensure extraSuggestedPartners does not contain any partner already
 * present in mainSuggestedPartners. This is necessary for the
 * consistency of suggestion list.
 */
export default many2many({
    name: 'extraSuggestedPartners',
    id: 'mail.models.Composer.fields.extraSuggestedPartners',
    global: true,
    target: 'Partner',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} param0.record
     * @returns {Partner[]}
     */
    compute({ ctx, env, record }) {
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
            record.mainSuggestedPartners(ctx),
        );
    },
});
