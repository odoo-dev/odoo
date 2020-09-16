/** @odoo-module alias=mail.models.Attachment.fields.isUnlinkPending **/

import attr from 'mail.model.field.attr.define';

/**
 * True if an unlink RPC is pending, used to prevent multiple
 * unlink attempts.
 */
export default attr({
    name: 'isUnlinkPending',
    id: 'mail.models.Attachment.fields.isUnlinkPending',
    global: true,
    default: false,
});
