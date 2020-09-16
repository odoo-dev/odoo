/** @odoo-module alias=mail.models.Composer.fields.isLastStateChangeProgrammatic **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether the last change (since the last render) was
 * programmatic. Useful to avoid restoring the state when its change was
 * from a user action, in particular to prevent the cursor from jumping
 * to its previous position after the user clicked on the textarea while
 * it didn't have the focus anymore.
 */
export default attr({
    name: 'isLastStateChangeProgrammatic',
    id: 'mail.models.Composer.fields.isLastStateChangeProgrammatic',
    global: true,
    default: false,
});
