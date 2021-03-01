odoo.define('sale_timesheet.so_line_many2one', function (require) {
"use strict";

const fieldRegistry = require('web.field_registry');
const FieldOne2Many = require('web.relational_fields').FieldOne2Many;

const SoLineOne2Many = FieldOne2Many.extend({

    /**
     * nodeName: timesheet_ids field is renamed in timesheet_grid so we have to name the field from Options.
     *
     * @override
     */
    _onFieldChanged(ev) {
        const nodeName = this.nodeOptions.nodeName;
        if (
            ev.data.changes &&
            nodeName &&
            ev.data.changes.hasOwnProperty(nodeName) &&
            ev.data.changes[nodeName].operation === 'UPDATE' &&
            ev.data.changes[nodeName].data.hasOwnProperty('so_line')) {
            const line = this.value.data.find(line => {
                return line.id === ev.data.changes[nodeName].id;
            });
            if (!line.is_so_line_edited) {
                ev.data.changes[nodeName].data.is_so_line_edited = true;
            }
        }
        this._super(...arguments);
    }
});


fieldRegistry.add('so_line_one2many', SoLineOne2Many);

return SoLineOne2Many;

});
