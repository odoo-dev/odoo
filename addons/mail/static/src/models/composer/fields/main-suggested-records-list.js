/** @odoo-module alias=mail.models.Composer.fields.mainSuggestedRecordsList **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'mainSuggestedRecordsList',
    id: 'mail.models.Composer.fields.mainSuggestedRecordsList',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Composer} param0.record
     * @returns {Record[]}
     */
    compute({ ctx, record }) {
        return record.mainSuggestedRecordsListName(ctx)
            ? record[record.mainSuggestedRecordsListName(ctx)](ctx)
            : [];
    },
});
