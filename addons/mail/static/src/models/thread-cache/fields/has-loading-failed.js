/** @odoo-module alias=mail.models.ThreadCache.fields.hasLoadingFailed **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether the last message fetch failed.
 */
export default attr({
    name: 'hasLoadingFailed',
    id: 'mail.models.ThreadCache.fields.hasLoadingFailed',
    global: true,
    default: false,
});
