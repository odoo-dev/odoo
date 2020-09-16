/** @odoo-module alias=mail.models.Partner.fields.hasCheckedUser **/

import attr from 'mail.model.field.attr.define';

/**
 * Whether an attempt was already made to fetch the user corresponding
 * to this partner. This prevents doing the same RPC multiple times.
 */
export default attr({
    name: 'hasCheckedUser',
    id: 'mail.models.Partner.fields.hasCheckedUser',
    global: true,
    default: false,
});
