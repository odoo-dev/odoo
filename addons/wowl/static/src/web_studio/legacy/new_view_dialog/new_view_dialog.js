odoo.define('web_studio.NewViewDialog', function (require) {
"use strict";

var ajax = require('web.ajax');
var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var session = require('web.session');
var _t = core._t;

var NewViewDialog = Dialog.extend({
    template: 'web_studio.NewViewDialog',
    /**
     * @constructor
     * @param {Object} params
     * @param {String} params.view_type
     * @param {Object} params.action
     * @param {Callback} params.callback
     */
    init: function (parent, params) {
        this.GROUPABLE_TYPES = ['many2one', 'char', 'boolean', 'selection', 'date', 'datetime'];
        this.MEASURABLE_TYPES = ['integer', 'float'];
        this.view_type = params.view_type;
        this.model = params.action.res_model;
        this.on_save_callback = params.callback;
        this.debug = config.isDebug();
        this.mandatory_stop_date = params.mandatory_stop_date;
        var options = {
            title: _.str.sprintf(_t("Generate %s View"), this.view_type),
            size: 'medium',
            buttons: [{
                text: _t("Activate View"),
                classes: 'btn-primary',
                click: this._onSave.bind(this)
            }, {
                text: _t("Cancel"),
                close: true
            }],
        };

        this._super(parent, options);
    },
    /**
     * @override
     */
    willStart: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return self._rpc({
                model: self.model,
                method: 'fields_get',
            }).then(function (fields) {
                self.fields = _.sortBy(fields, function (field, key) {
                    field.name = key;
                    return field.string;
                });
                self._computeFields();
            });
        });
    },
    /**
     * @override
     */
    start: function () {
        this._super.apply(this, arguments);
        this.$modal.addClass('o_web_studio_new_view_modal');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Compute date, row and measure fields.
     */
    _computeFields: function () {
        var self = this;

        this.date_fields = [];
        this.row_fields = [];
        this.measure_fields = [];
        _.each(this.fields, function (field) {
            if (field.store) {
                // date fields
                if (field.type === 'date' || field.type === 'datetime') {
                    self.date_fields.push(field);
                }
                // row fields
                if (_.contains(self.GROUPABLE_TYPES, field.type)) {
                    self.row_fields.push(field);
                }
                // measure fields
                if (_.contains(self.MEASURABLE_TYPES, field.type)) {
                    // id and sequence are not measurable
                    if (field.name !== 'id' && field.name !== 'sequence') {
                        self.measure_fields.push(field);
                    }
                }
            }
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Creates the new view.
     */
    _onSave: function () {
        var self = this;
        var attrs = {};
        $.each(this.$('.o_web_studio_select select'), function (key, select) {
            attrs[$(select).data('field')] = $(select).val();
        });
        ajax.jsonRpc('/web_studio/create_default_view', 'call', {
            model: this.model,
            view_type: this.view_type,
            attrs: attrs,
            context: session.user_context,
        }).then(function () {
            if (self.on_save_callback) {
                self.on_save_callback();
            }
        });
        this.close();
    },

});

return NewViewDialog;

});
