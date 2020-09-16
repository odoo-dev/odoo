/** @odoo-module alias=mail.models.Composer.fields.mainSuggestedRecordsListName **/

import attr from 'mail.model.field.attr.define';

/**
 * Allows to have different model types of mentions through a dynamic process
 * RPC can provide 2 lists and the first is defined as "main"
 */
export default attr({
    name: 'mainSuggestedRecordsListName',
    id: 'mail.models.Composer.fields.mainSuggestedRecordsListName',
    global: true,
    default: '',
});
