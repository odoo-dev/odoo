odoo.define('web_studio.NewButtonBoxDialog', function (require) {
"use strict";

var core = require('web.core');
var Dialog = require('web.Dialog');
var relational_fields = require('web.relational_fields');

var StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');
var utils = require('web_studio.utils');

var Many2one = relational_fields.FieldMany2One;
var _t = core._t;

var NewButtonBoxDialog = Dialog.extend(StandaloneFieldManagerMixin, {
    template: 'web_studio.NewButtonBoxDialog',
    events: {
        'click .o_web_studio_icon_selector': '_on_IconSelector',
    },
    /**
     * @override
     */
    init: function (parent, model_name) {
        this.model_name = model_name;
        this.ICONS = utils.ICONS;

        var options = {
            title: _t('Add a Button'),
            size: 'small',
            buttons: [{
                text: _t("Confirm"),
                classes: 'btn-primary',
                click: this._onConfirm.bind(this)
            }, {
                text: _t("Cancel"),
                close: true
            }],
        };

        this._super(parent, options);
        StandaloneFieldManagerMixin.init.call(this);

        var self = this;
        this.opened().then(function () {
            // focus on input
            self.$el.find('input[name="string"]').focus();
        });
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        var defs = [];
        defs.push(this._super.apply(this, arguments));
        defs.push(this.model.makeRecord('ir.actions.act_window', [{
            name: 'field',
            relation: 'ir.model.fields',
            type: 'many2one',
            domain: [['relation', '=', this.model_name], ['ttype', '=', 'many2one'], ['store', '=', true]],
        }]).then(function (recordID) {
            var options = {
                mode: 'edit',
                attrs: {
                    can_create: false,
                    can_write: false,
                },
            };
            var record = self.model.get(recordID);
            self.many2one = new Many2one(self, 'field', record, options);
            self._registerWidget(recordID, 'field', self.many2one);
            self.many2one.appendTo(self.$('.js_many2one_field'));
        }));
        return Promise.all(defs);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onConfirm: function () {
        var string = this.$('input[name="string"]').val() || 'New Button';
        var icon = this.selected_icon || this.ICONS[0].split(' ')[1];
        var field_id = this.many2one.value && this.many2one.value.res_id;
        if (!field_id) {
            Dialog.alert(this, _t('Select a related field.'));
            return;
        }
        this.trigger('saved', {
            string: string,
            field_id: field_id,
            icon: icon,
        });
        this.close();
    },
    /**
     * @private
     * @param {Event} ev
     */
    _on_IconSelector: function (ev) {
        var $el = $(ev.currentTarget);
        this.$('.o_selected').removeClass('o_selected');
        $el.addClass('o_selected');
        var icon = $(ev.currentTarget).data('value');
        // only takes `fa-...` instead of `fa fa-...`
        this.selected_icon = icon && icon.split(' ')[1];
    },
});

return NewButtonBoxDialog;

});
