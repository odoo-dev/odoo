/** @odoo-module alias=mail.models.Composer.fields.discussAsReplying **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Instance of discuss if this composer is used as the reply composer
 * from Inbox. This field is computed from the inverse relation and
 * should be considered read-only.
 */
export default one2one({
    name: 'discussAsReplying',
    id: 'mail.models.Composer.fields.discussAsReplying',
    global: true,
    target: 'Discuss',
    inverse: 'replyingToMessageOriginThreadComposer',
});
