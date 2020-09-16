/** @odoo-module alias=mail.model.field.one2one.define **/

import field from 'mail.model.field.define';

/**
 * @param {string} targetModelName
 * @param {Object} data
 * @returns {mail.classes.ModelFieldDefinition}
 */
export default function define(targetModelName, data) {
    return field({
        ...data,
        targetModelName,
        type: 'one2one',
    });
}
