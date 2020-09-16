/** @odoo-module alias=mail.models.Locale.fields.textDirection **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'textDirection',
    id: 'mail.models.Locale.fields.textDirection',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @returns {string}
     */
    compute({ env }) {
        return env._t.database.parameters.direction;
    },
});
