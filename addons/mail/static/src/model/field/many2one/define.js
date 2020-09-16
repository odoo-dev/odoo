/** @odoo-module alias=mail.model.field.many2one.define **/

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
        type: 'many2one',
    });
}
