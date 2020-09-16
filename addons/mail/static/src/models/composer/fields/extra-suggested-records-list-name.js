/** @odoo-module alias=mail.models.Composer.fields.extraSuggestedRecordsListName **/

import attr from 'mail.model.field.attr.define';

/**
 * Allows to have different model types of mentions through a dynamic process
 * RPC can provide 2 lists and the second is defined as "extra"
 */
export default attr({
    name: 'extraSuggestedRecordsListName',
    id: 'mail.models.Composer.fields.extraSuggestedRecordsListName',
    global: true,
    default: '',
});
