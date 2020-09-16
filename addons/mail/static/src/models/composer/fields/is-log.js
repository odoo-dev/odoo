/** @odoo-module alias=mail.models.Composer.fields.isLog **/

import attr from 'mail.model.field.attr.define';

/**
 * If true composer will log a note, else a comment will be posted.
 */
export default attr({
    name: 'isLog',
    id: 'mail.models.Composer.fields.isLog',
    global: true,
    default: false,
});
