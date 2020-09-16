/** @odoo-module alias=mail.models.Discuss.fields.replyingToMessageOriginThread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * The thread concerned by the reply feature in Inbox. It depends on the
 * message set to be replied, and should be considered read-only.
 */
export default many2one({
    name: 'replyingToMessageOriginThread',
    id: 'mail.models.Discuss.fields.replyingToMessageOriginThread',
    global: true,
    target: 'Thread',
    related: 'replyingToMessage.originThread',
});
