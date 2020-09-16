/** @odoo-module alias=mail.models.Activity.fields.note **/

import attr from 'mail.model.field.attr.define';

/**
 * This value is meant to be returned by the server
 * (and has been sanitized before stored into db).
 * Do not use this value in a 't-raw' if the activity has been created
 * directly from user input and not from server data as it's not escaped.
 */
export default attr({
    name: 'note',
    id: 'mail.models.Activity.fields.note',
    global: true,
    /**
     * Wysiwyg editor put `<p><br></p>` even without a note on the activity.
     * This compute replaces this almost empty value by an actual empty
     * value, to reduce the size the empty note takes on the UI.
     *
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Activity} param0.record
     * @returns {string|undefined}
     */
     compute({ ctx, env, record }) {
        if (record.note(ctx) === '<p><br></p>') {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        return record.note(ctx);
    },
});
