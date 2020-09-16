/** @odoo-module alias=mail.models.Locale.fields.language **/

import attr from 'mail.model.field.attr.define';

/**
 * Language used by interface. Formatted like:
 * {language ISO 2}_{country ISO 2} (eg: fr_FR).
 */
export default attr({
    name: 'language',
    id: 'mail.models.Locale.fields.language',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {string}
     */
    compute({ env }) {
        return env._t.database.parameters.code;
    },
});
