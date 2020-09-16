/** @odoo-module alias=mail.models.Messaging.fields.publicPartners **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Determines which partners should be considered the public partners,
 * which are special partners notably used in livechat.
 */
export default many2many({
    name: 'publicPartners',
    id: 'mail.models.Messaging.fields.publicPartners',
    global: true,
    target: 'Partner',
});
