odoo.define('web_studio.MapViewDialog', function (require) {
"use strict";

var ajax = require('web.ajax');
var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var session = require('web.session');

var _t = core._t;

var MapViewDialog = Dialog.extend({
    template: 'web_studio.MapViewDialog',
    /**
     * @constructor
     * @param {Object} params
     * @param {Object} params.action
     * @param {Callback} params.callback
     */
    init: function (parent, params) {
        this.parent = parent;
        this.model = params.action.res_model;
        this.onSaveCallback = params.callback;
        this.debug = config.isDebug();

        this._super(parent, {
            title: _t("Generate Map View"),
            size: 'medium',
            buttons: [{
                text: _t("Activate View"),
                classes: 'btn-primary',
                click: this._onSave.bind(this),
            }, {
                text: _t("Cancel"),
                close: true,
            }],
        });
    },
    /**
     * @override
     */
    willStart: function () {
        const prom = this._rpc({
            model: this.model,
            method: 'fields_get',
        }).then(fields => {
            const sortedFields = _.sortBy(fields, (field, key) => {
                field.name = key;
                return field.string;
            });
            this.fields = _.filter(sortedFields, field => field.type === 'many2one' && field.relation === 'res.partner');
        });
        return Promise.all([prom, this._super.apply(this, arguments)]);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Display alert if no field found
     *
     * @override
     */
    start: function () {
        return this._super.apply(this, arguments).then(() => {
            if (_.isEmpty(this.fields)) {
                const message = _t("A contact field is required to use the Map view.\r\nCreate a many2one field to the Contacts model before activating it.");
                Dialog.alert(null, message, {
                    title: _t("Contact Field Required"),
                    dialogClass: 'o_web_studio_preserve_space'
                }).opened(() => {
                    this.close();
                });
            }
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Create the new map view.
     *
     * @private
     */
    _onSave: function () {
        const value = this.$('select[name=res_partner]').val();
        ajax.jsonRpc('/web_studio/create_default_view', 'call', {
            model: this.model,
            view_type: 'map',
            attrs: {res_partner: value},
            context: session.user_context,
        }).then(() => {
            if (this.onSaveCallback) {
                this.onSaveCallback();
            }
        });
        this.close();
    },
});

return MapViewDialog;

});
