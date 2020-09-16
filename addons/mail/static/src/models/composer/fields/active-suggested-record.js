/** @odoo-module alias=mail.models.Composer.fields.activeSuggestedRecord **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'activeSuggestedRecord',
    id: 'mail.models.Composer.fields.activeSuggestedRecord',
    global: true,
    /**
    * @param {Object} param0
    * @param {string} param0.ctx
    * @param {Composer} param0.record
    * @returns {Record|undefined}
    */
    compute({ ctx, record }) {
        if (!record[record.activeSuggestedRecordName(ctx)](ctx)) {
            return;
        }
        return record[record.activeSuggestedRecordName(ctx)](ctx);
    },
});
