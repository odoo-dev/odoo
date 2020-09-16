/** @odoo-module alias=mail.models.RecordField.actions.replace **/

import action from 'mail.action.define';

/**
 * Set a 'replace' operation on this relational field.
 */
export default action({
    name: 'RecordField/replace',
    id: 'mail.model.RecordField.actions.replace',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Record|Record[]} value
     * @param {Object} [options]
     * @returns {boolean} whether the value changed for the current field
     */
    func(
        { env },
        field,
        value,
        options,
    ) {
        if (['one2one', 'many2one'].includes(field.relType)) {
            // for x2one replace is just link
            return env.services.action.dispatch(
                'RecordField/_linkX2One',
                field,
                value,
                options,
            );
        }
        // for x2many: smart process to avoid unnecessary unlink/link
        let hasChanged = false;
        let hasToReorder = false;
        const otherRecordsSet = field.value;
        const otherRecordsList = [...otherRecordsSet];
        const recordsToReplaceList = [
            ...env.services.action.dispatch(
                'RecordField/_convertX2ManyValue',
                field,
                value,
            ),
        ];
        const recordsToReplaceSet = new Set(recordsToReplaceList);
        // records to link
        const recordsToLink = [];
        for (let i = 0; i < recordsToReplaceList.length; i++) {
            const recordToReplace = recordsToReplaceList[i];
            if (!otherRecordsSet.has(recordToReplace)) {
                recordsToLink.push(recordToReplace);
            }
            if (otherRecordsList[i] !== recordToReplace) {
                hasToReorder = true;
            }
        }
        if (
            env.services.action.dispatch(
                'RecordField/_linkX2Many',
                field,
                recordsToLink,
                options,
            )
        ) {
            hasChanged = true;
        }
        // records to unlink
        const recordsToUnlink = [];
        for (let i = 0; i < otherRecordsList.length; i++) {
            const otherRecord = otherRecordsList[i];
            if (!recordsToReplaceSet.has(otherRecord)) {
                recordsToUnlink.push(otherRecord);
            }
            if (recordsToReplaceList[i] !== otherRecord) {
                hasToReorder = true;
            }
        }
        if (
            env.services.action.dispatch(
                'RecordField/_unlinkX2Many',
                field,
                recordsToUnlink,
                options,
            )
        ) {
            hasChanged = true;
        }
        // reorder result
        if (hasToReorder) {
            otherRecordsSet.clear();
            for (const record of recordsToReplaceList) {
                otherRecordsSet.add(record);
            }
            hasChanged = true;
        }
        return hasChanged;
    },
});
