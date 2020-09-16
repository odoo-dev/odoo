/** @odoo-module alias=mail.models.Composer.fields.hasToScrollToActiveSuggestion **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether the currently active suggestion should be scrolled
 * into view.
 */
export default attr({
    name: 'hasToScrollToActiveSuggestion',
    id: 'mail.models.Composer.fields.hasToScrollToActiveSuggestion',
    global: true,
    default: true,
});
