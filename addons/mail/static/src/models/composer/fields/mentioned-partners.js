/** @odoo-module alias=mail.models.Composer.fields.mentionedPartners **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Detects if mentioned partners are still in the composer text input content
 * and removes them if not.
 */
export default many2many({
    name: 'mentionedPartners',
    id: 'mail.models.Composer.fields.mentionedPartners',
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
        const unmentionedPartners = [];
        // ensure the same mention is not used multiple times if multiple
        // partners have the same name
        const namesIndex = {};
        for (const partner of record.mentionedPartners(ctx)) {
            const fromIndex = namesIndex[partner.name(ctx)] !== undefined
                ? namesIndex[partner.name(ctx)] + 1
                : 0;
            const index = record.textInputContent(ctx).indexOf(
                `@${partner.name(ctx)}`,
                fromIndex,
            );
            if (index !== -1) {
                namesIndex[partner.name(ctx)] = index;
            } else {
                unmentionedPartners.push(partner);
            }
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
            unmentionedPartners,
        );
    },
});
