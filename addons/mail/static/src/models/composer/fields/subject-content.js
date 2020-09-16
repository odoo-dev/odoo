/** @odoo-module alias=mail.models.Composer.fields.subjectContent **/

import attr from 'mail.model.field.attr.define';

/**
 * Composer subject input content.
 */
export default attr({
    name: 'subjectContent',
    id: 'mail.models.Composer.fields.subjectContent',
    global: true,
    default: "",
});
