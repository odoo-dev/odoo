/** @odoo-module alias=mail.models.ThreadView.fields.lastVisibleMessage **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Most recent message in this ThreadView that has been shown to the
 * current partner in the currently displayed thread cache.
 */
export default many2one({
    name: 'lastVisibleMessage',
    id: 'mail.models.ThreadView.fields.lastVisibleMessage',
    global: true,
    target: 'Message',
});
