/** @odoo-module alias=mail.model.field.attr.define **/

import field from 'mail.model.field.define';

/**
 * @param {Object} data
 * @returns {mail.classes.ModelFieldDefinition}
 */
export default function define(data) {
    return field({
        ...data,
        type: 'attr',
    });
}
