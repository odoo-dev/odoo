/** @odoo-module alias=mail.models.Activity.fields.feedbackBackup **/

import attr from 'mail.model.field.attr.define';

/**
 * Backup of the feedback content of an activity to be marked as done in the popover.
 * Feature-specific to restoring the feedback content when component is re-mounted.
 * In all other cases, this field value should not be trusted.
 */
export default attr({
    name: 'feedbackBackup',
    id: 'mail.models.Activity.fields.feedbackBackup',
    global: true,
});
