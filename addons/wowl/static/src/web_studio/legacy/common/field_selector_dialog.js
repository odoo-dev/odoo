odoo.define('web_studio.FieldSelectorDialog', function (require) {
"use strict";

var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var _t = core._t;

var FieldSelectorDialog = Dialog.extend({
    template: 'web_studio.FieldSelectorDialog',
    /**
     * @constructor
     * @param {Widget} parent
     * @param {Object} fields
     * @param {Boolean} show_new
     */
    init: function (parent, fields, show_new) {
        // set the field name because key will be lost after sorting dict
        this.orderered_fields = _.sortBy(
            _.mapObject(fields, function (attrs, fieldName) {
                return {
                    name: fieldName,
                    string: attrs.string
                };
            }), 'string');
        this.show_new = show_new;
        this.debug = config.isDebug();

        var options = {
            title: _t('Select a Field'),
            buttons: [{
                text: _t("Confirm"),
                classes: 'btn-primary',
                click: this._onConfirm.bind(this),
                close: true
            }, {
                text: _t("Cancel"),
                click: this._onCancel.bind(this),
                close: true
            }],
        };
        this._super(parent, options);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onConfirm: function () {
        var selectedField = this.$('select[name="field"]').val();
        this.trigger('confirm', selectedField);
    },
    /**
     * @private
     */
    _onCancel: function () {
        this.trigger('cancel');
    },
});


return FieldSelectorDialog;

});
