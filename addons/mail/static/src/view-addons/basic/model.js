/** @odoo-module alias=mail.viewAddons.basic.model **/

import BasicModel from 'web.BasicModel';

BasicModel.include({

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Fetches the activities displayed by the activity field widget in form
     * views.
     *
     * @private
     * @param {Object} record - an element from the localData
     * @param {string} fieldName
     * @return {Promise<Array>} resolved with the activities
     */
    _fetchSpecialActivity(record, fieldName) {
        const localID = (record._changes && fieldName in record._changes)
            ? record._changes[fieldName]
            : record.data[fieldName];
        return _readActivities(this, this.localData[localID].res_ids);
    },
    /**
     * @private
     * @param {Object} record - an element from the localData
     * @param {string} fieldName
     * @return {Object} invalidPartnerIds
     */
    async _setInvalidMany2ManyTagsEmail(record, fieldName) {
        const localID = (record._changes && fieldName in record._changes)
            ? record._changes[fieldName]
            : record.data[fieldName];
        const list = this._applyX2ManyOperations(this.localData[localID]);
        const invalidPartnerIds = [];
        for (const id of list.data) {
            const record = this.localData[id];
            if (!record.data.email) {
                invalidPartnerIds.push(record);
            }
        }
        let def;
        if (invalidPartnerIds.length) {
            // remove invalid partners
            const changes = {
                ids: _.pluck(invalidPartnerIds, 'id'),
                operation: 'DELETE',
            };
            def = this._applyX2ManyChange(record, fieldName, changes);
        }
        await def;
        return {
            invalidPartnerIds: _.pluck(invalidPartnerIds, 'res_id'),
        };
    },
});
