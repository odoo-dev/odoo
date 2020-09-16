/** @odoo-module alias=mail.models.Discuss.fields.replyingToMessageOriginThreadComposer **/

import one2one from 'mail.model.field.one2one.define';

/**
 * The composer to display for the reply feature in Inbox. It depends
 * on the message set to be replied.
 */
export default one2one({
    name: 'replyingToMessageOriginThreadComposer',
    id: 'mail.models.Discuss.fields.replyingToMessageOriginThreadComposer',
    global: true,
    target: 'Composer',
    related: 'replyingToMessageOriginThread.composer',
    inverse: 'discussAsReplying',
});
