/** @odoo-module alias=mail.models.ThreadView.fields.lastNonTransientMessage **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Serves as compute dependency.
 */
export default many2one({
    name: 'lastNonTransientMessage',
    id: 'mail.models.ThreadView.fields.lastNonTransientMessage',
    global: true,
    target: 'Message',
    related: 'thread.lastNonTransientMessage',
});
