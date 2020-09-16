/** @odoo-module alias=mail.models.Composer.fields.hasSuggestions **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasSuggestions',
    id: 'mail.models.Composer.fields.hasSuggestions',
    global: true,
    default: false,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {Composer} param0.record
     * @return {boolean}
     */
    compute({ ctx, record }) {
        const hasMainSuggestedRecordsList = record.mainSuggestedRecordsListName(ctx)
            ? record[
                record.mainSuggestedRecordsListName(ctx)
            ](ctx).length > 0
            : false;
        const hasExtraSuggestedRecordsList = record.extraSuggestedRecordsListName(ctx)
            ? record[
                record.extraSuggestedRecordsListName(ctx)
            ](ctx).length > 0
            : false;
        return hasMainSuggestedRecordsList || hasExtraSuggestedRecordsList;
    },
});
