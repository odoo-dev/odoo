/** @odoo-module alias=mail.models.Composer.fields.extraSuggestedRecordsList **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'extraSuggestedRecordsList',
    id: 'mail.models.Composer.fields.extraSuggestedRecordsList',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Composer} param0.record
     * @returns {Record[]}
     */
    compute({ ctx, record }) {
        return (
            record.extraSuggestedRecordsListName(ctx)
                ? record[record.extraSuggestedRecordsListName(ctx)](ctx)
                : []
        );
    },
});
