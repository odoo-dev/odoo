odoo.define('web_studio.NewFieldDialog', function (require) {
"use strict";

var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var relational_fields = require('web.relational_fields');
var ModelFieldSelector = require('web.ModelFieldSelector');
var StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');

var _t = core._t;
var qweb = core.qweb;
var Many2one = relational_fields.FieldMany2One;

// TODO: refactor this file

var NewFieldDialog = Dialog.extend(StandaloneFieldManagerMixin, {
    template: 'web_studio.NewFieldDialog',
    events: {
        'keyup .o_web_studio_selection_new_value > input': '_onAddSelectionValue',
        'click .o_web_studio_edit_selection_value': '_onEditSelectionValue',
        'click .o_web_studio_remove_selection_value': '_onRemoveSelectionValue',
        'click .o_web_studio_add_selection_value': '_onAddSelectionValue',
        'click .o_web_studio_clear_selection_value': '_onClearSelectionValue',
        'blur .o_web_studio_selection_editor .o_web_studio_selection_input': '_onSelectionInputBlur',
    },
    /**
     * @constructor
     * @param {String} model_name
     * @param {Object} field
     * @param {Object} fields
     * @param {Object[]} field_chain - list of the initial field chain parts
     */
    init: function (parent, model_name, field, fields, field_chain) {
        this.model_name = model_name;
        this.type = field.type;
        this.field = field;
        this.fieldChain = field_chain || [];
        this.order = field.order;
        this.followRelations = field.followRelations || function (field) {return true;};
        this.filter = field.filter || function (field) {return true;};
        this.filters = field.filters;

        if (this.type === 'selection') {
            this.selection = this.field.selection && this.field.selection.slice() || [];
        }

        this.fields = fields;
        var options = _.extend({
            title: _t('Field Properties'),
            size: 'small',
            buttons: [{
                text: _t("Confirm"),
                classes: 'btn-primary',
                click: this._onSave.bind(this),
            }, {
                text: _t("Cancel"),
                close: true,
            }],
        }, options);
        this._super(parent, options);
        StandaloneFieldManagerMixin.init.call(this);
    },
    /**
     * @override
     */
    renderElement: function () {
        this._super.apply(this, arguments);

        if (this.type === 'selection') {
           this.$('.o_web_studio_selection_editor').sortable({
                axis: 'y',
                containment: '.o_web_studio_field_dialog_form',
                items: '> li',
                helper: 'clone',
                handle: '.input-group',
                opacity: 0.6,
                stop: this._resequenceSelection.bind(this),
           });
       }
    },
    /**
     * @override
     */
    start: function() {
        var self = this;
        var defs = [];
        var record;
        var options = {
            mode: 'edit',
        };

        this.$modal.addClass('o_web_studio_field_modal');

        if (this.type === 'selection') {
            // Focus on the input responsible for adding new selection value
            this.opened().then(function () {
                self.$('.o_web_studio_selection_new_value > input').focus();
            });
        } else if (this.type === 'one2many') {
            defs.push(this.model.makeRecord('ir.model.fields', [{
                name: 'field',
                relation: 'ir.model.fields',
                type: 'many2one',
                domain: [['relation', '=', this.model_name], ['ttype', '=', 'many2one'], ['model_id.abstract', '=', false]],
            }], {
                'field': {
                    can_create: false,
                }
            }).then(function (recordID) {
                record = self.model.get(recordID);
                self.many2one_field = new Many2one(self, 'field', record, options);
                self._registerWidget(recordID, 'field', self.many2one_field);
                self.many2one_field.nodeOptions.no_create_edit = !config.isDebug();
                self.many2one_field.appendTo(self.$('.o_many2one_field'));
            }));
        } else if (_.contains(['many2many', 'many2one'], this.type)) {
            defs.push(this.model.makeRecord('ir.model', [{
                name: 'model',
                relation: 'ir.model',
                type: 'many2one',
                domain: [['transient', '=', false], ['abstract', '=', false]]
            }]).then(function (recordID) {
                record = self.model.get(recordID);
                self.many2one_model = new Many2one(self, 'model', record, options);
                self._registerWidget(recordID, 'model', self.many2one_model);
                self.many2one_model.nodeOptions.no_create_edit = !config.isDebug();
                self.many2one_model.appendTo(self.$('.o_many2one_model'));
            }));
        } else if (this.type === 'related') {
            // This restores default modal height (bootstrap) and allows field selector to overflow
            this.$el.css("overflow", "visible").closest(".modal-dialog").css("height", "auto");
            var field_options = {
                order: this.order,
                filter: this.filter,
                followRelations: this.followRelations,
                fields: this.fields, //_.filter(this.fields, this.filter),
                readonly: false,
                filters: _.extend({}, this.filters, {searchable: false}),
            };
            this.fieldSelector = new ModelFieldSelector(this, this.model_name, this.fieldChain, field_options);
            defs.push(this.fieldSelector.appendTo(this.$('.o_many2one_field')));
        }

        defs.push(this._super.apply(this, arguments));
        return Promise.all(defs);
    },

    /**
     * @private
     * @param {Event} e
     */
    _resequenceSelection: function () {
        var self = this;
        var newSelection = [];
        this.$('.o_web_studio_selection_editor li').each(function (index, u) {
            var value = u.dataset.value;
            var string = _.find(self.selection, function(el) {
                return el[0] === value;
            })[1];
            newSelection.push([value, string]);
        });
        this.selection = newSelection;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} e
     */
    _onAddSelectionValue: function (e) {
        if (e.type === "keyup" && e.which !== $.ui.keyCode.ENTER) { return; }

        var $input = this.$(".o_web_studio_selection_new_value input");
        var string = $input.val().trim();

        if (string && !_.find(this.selection, function(el) {return el[1] === string; })) {
            // add a new element
            this.selection.push([string, string]);
        }
        this.renderElement();
        this.$('.o_web_studio_selection_new_value > input').focus();
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onEditSelectionValue: function (ev) {
        var self = this;
        var $btn = $(ev.currentTarget);

        if (config.isDebug()) {
            var val = $btn.closest('li')[0].dataset.value;  // use dataset to always get a string
            var index = _.findIndex(this.selection, function (el) {return el[0] === val;});
            new Dialog(this, {
                title: _t('Edit Value'),
                size: 'small',
                $content: $(qweb.render('web_studio.SelectionValues.edit', {
                    element: self.selection[index],
                })),
                buttons: [
                    {text: _t('Confirm'), classes: 'btn-primary', close: true, click: function () {
                        var newValue = this.$('input#o_selection_value').val() || val;
                        var newString = this.$('input#o_selection_label').val();
                        self.selection[index] = [newValue, newString];
                        self.renderElement();
                    }},
                    {text: _t('Close'), close: true},
                ],
            }).open();
        } else {
            $btn.toggleClass('fa-check fa-pencil-square-o');
            var $input = $btn.closest('li').find('.o_web_studio_selection_input.d-none');
            var $span = $input.siblings('.o_web_studio_selection_label');
            // Toggle span and input, and set the initial value for input
            $input.val($span.toggleClass('d-none').text().trim()).toggleClass('d-none').focus();
        }
    },
    /**
     * Removes a selection value from the widget
     * The python is in charge of determining whether some records
     * have a deleted value, and raises if this is the case
     *
     * @private
     * @param {Event} e
     */
    _onRemoveSelectionValue: function (e) {
        var val = $(e.target).closest('li')[0].dataset.value;
        var element = _.find(this.selection, function(el) {return el[0] === val; });
        var index = this.selection.indexOf(element);
        if (index >= 0) {
            this.selection.splice(index, 1);
        }
        this.renderElement();
    },
    /**
     * @private
     */
    _onClearSelectionValue: function () {
        this.$('.o_web_studio_selection_input').val("").focus();
    },
    /**
     * @private
     */
    _onSave: function () {
        var values = {};
        if (this.type === 'one2many') {
            if (!this.many2one_field.value) {
                this.trigger_up('warning', {title: _t('You must select a related field')});
                return;
            }
            values.relation_field_id = this.many2one_field.value.res_id;
        } else if (_.contains(['many2many', 'many2one'], this.type)) {
            if (!this.many2one_model.value) {
                this.trigger_up('warning', {title: _t('You must select a relation')});
                return;
            }
            values.relation_id = this.many2one_model.value.res_id;
            values.field_description = this.many2one_model.m2o_value;
        } else if (this.type === 'selection') {
            var newSelection = this.$('.o_web_studio_selection_new_value > input').val();
            if (newSelection) {
                this.selection.push([newSelection, newSelection]);
            }
            values.selection = JSON.stringify(this.selection);
        } else if (this.type === 'related') {
            var selectedField = this.fieldSelector.getSelectedField();
            if (!selectedField) {
                this.trigger_up('warning', {title: _t('You must select a related field')});
                return;
            }
            values.string = selectedField.string;
            values.model = selectedField.model;
            values.related = this.fieldSelector.chain.join('.');
            values.type = selectedField.type;
            values.readonly = true;
            values.copy = false;
            values.store = selectedField.store;
            if (_.contains(['many2one', 'many2many'], selectedField.type)) {
                values.relation = selectedField.relation;
            } else if (selectedField.type === 'one2many') {
                values.relational_model = selectedField.model;
            } else if (selectedField.type === 'selection') {
                values.selection = selectedField.selection;
            } else if (selectedField.type === 'monetary') {
                // find the associated currency field on the related model in
                // case there is no currency field on the current model
                var currencyField = _.find(_.last(this.fieldSelector.pages), function (el) {
                    return el.name === 'currency_id' || el.name === 'x_currency_id';
                });
                if (currencyField) {
                    var chain = this.fieldSelector.chain.slice();
                    chain.splice(chain.length - 1, 1, currencyField.name);
                    values._currency = chain.join('.');
                }
            }

            if (_.contains(['one2many', 'many2many'], selectedField.type)) {
                values.store = false;
            }
        }
        this.trigger('field_default_values_saved', values);
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onSelectionInputBlur: function (ev) {
        var $input = $(ev.currentTarget);
        var val = $input.closest('li').data('value');
        var index = _.findIndex(this.selection, function (el) { return el[0] === val; });
        this.selection[index][1] = $input.val();
        this.renderElement();
    },
});

return NewFieldDialog;

});
