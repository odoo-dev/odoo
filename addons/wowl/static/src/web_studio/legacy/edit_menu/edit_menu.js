odoo.define('web_studio.EditMenu', function (require) {
"use strict";

const CommonMenuDialog = require('web_studio.CommonMenuDialog');
var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var FieldManagerMixin = require('web.FieldManagerMixin');
var form_common = require('web.view_dialogs');
var relational_fields = require('web.relational_fields');
var session = require('web.session');
var StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');
var Widget = require('web.Widget');

var Many2One = relational_fields.FieldMany2One;
const FieldRadio = relational_fields.FieldRadio;
var _t = core._t;

var MenuItem = Widget.extend({
    template: 'web_studio.EditMenu.MenuItem',
    events: {
        'click .o_web_edit_menu': '_onClick',
    },
    /**
     * @constructor
     * @param {Widget} parent
     * @param {Object} menu_data
     * @param {Integer} current_primary_menu
     */
    init: function (parent, menu_data, current_primary_menu) {
        this._super.apply(this, arguments);
        this.menu_data = menu_data;
        this.current_primary_menu = current_primary_menu;
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    editMenu: function (scrollToBottom) {
        new EditMenuDialog(this, this.menu_data, this.current_primary_menu, scrollToBottom)
            .open();
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Open a dialog to edit the clicked menu.
     *
     * @private
     * @param {Event} event
     */
    _onClick: function (event) {
        event.preventDefault();
        this.editMenu();
    },
});

var EditMenuDialog = Dialog.extend({
    template: 'web_studio.EditMenu.Dialog',
    events: _.extend({}, Dialog.prototype.events, {
        'click button.js_edit_menu': '_onEditMenu',
        'click button.js_delete_menu': '_onDeleteMenu',
    }),
    /**
     * @constructor
     * @param {Widget} parent
     * @param {Object} menu_data
     * @param {Integer} current_primary_menu
     */
    init: function (parent, menu_data, current_primary_menu, scrollToBottom) {
        var options = {
            title: _t('Edit Menu'),
            size: 'medium',
            dialogClass: 'o_web_studio_edit_menu_modal',
            buttons: [{
                text: _t("Confirm"),
                classes: 'btn-primary',
                click: this._onSave.bind(this),
            }, {
                text: _t("Cancel"),
                close: true,
            }, {
                icon: 'fa-plus-circle',
                text: _t("New Menu"),
                classes: 'btn-secondary js_add_menu ml-auto',
                click: this._onAddMenu.bind(this),
            }],
        };
        this.current_primary_menu = current_primary_menu;
        this.roots = this.getMenuDataFiltered(menu_data);
        this.scrollToBottom = scrollToBottom;
        this.to_delete = [];
        this.to_move = {};

        this._super(parent, options);
    },
    /**
     * @override
     */
    start: function () {
        this.$('.oe_menu_editor').nestedSortable({
            listType: 'ul',
            handle: 'div',
            items: 'li',
            maxLevels: 5,
            toleranceElement: '> div',
            forcePlaceholderSize: true,
            opacity: 0.6,
            placeholder: 'oe_menu_placeholder',
            tolerance: 'pointer',
            attribute: 'data-menu-id',
            expression: '()(.+)', // nestedSortable takes the second match of an expression (*sigh*)
            relocate: this.moveMenu.bind(this),
        });
        this.opened().then(() => {
            if (this.scrollToBottom) {
                this.$el.scrollTop(this.$el.prop('scrollHeight'));
            }
        });
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @param {Object} menu_data
     * @returns {Object}
     */
    getMenuDataFiltered: function (menu_data) {
        var self = this;
        var menus = menu_data.childrenTree.filter(function (el) {
            return el.id === self.current_primary_menu;
        });
        return menus;
    },
    /**
     * @param {Event} ev
     */
    moveMenu: function (ev, ui) {
        var self = this;

        var $menu = $(ui.item);
        var menu_id = $menu.data('menu-id');

        this.to_move[menu_id] = {
            parent_menu_id: $menu.parents('[data-menu-id]').data('menu-id') || this.current_primary_menu,
            sequence: $menu.index(),
        };

        // Resequence siblings
        _.each($menu.siblings('li'), function (el) {
            var menu_id = $(el).data('menu-id');
            if (menu_id in self.to_move) {
                self.to_move[menu_id].sequence = $(el).index();
            } else {
                self.to_move[menu_id] = {sequence: $(el).index()};
            }
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Boolean} keep_open
     */
    _reloadMenuData: function (keep_open, scrollToBottom) {
        this.trigger_up('reload_menu_data', { keep_open: keep_open, scroll_to_bottom: scrollToBottom});
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onAddMenu: function (ev) {
        ev.preventDefault();

        var self = this;
        new NewMenuDialog(this, {
            parent_menu_id: this.current_primary_menu,
            on_saved: function () {
                self._saveChanges().then(function () {
                    self._reloadMenuData(true, true);
                });
            },
        }).open();
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onDeleteMenu: function (ev) {
        var $menu = $(ev.currentTarget).closest('[data-menu-id]');
        var menu_id = $menu.data('menu-id') || 0;
        if (menu_id) {
            this.to_delete.push(menu_id);
        }
        $menu.remove();
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onEditMenu: function (ev) {
        var self = this;
        var menu_id = $(ev.currentTarget).closest('[data-menu-id]').data('menu-id');
        new form_common.FormViewDialog(this, {
            res_model: 'ir.ui.menu',
            res_id: menu_id,
            on_saved: function () {
                self._saveChanges().then(function () {
                    self._reloadMenuData(true);
                });
            },
        }).open();
    },
    /**
     * Save the current changes (in `to_move` and `to_delete`).
     *
     * @private
     */
    _onSave: function () {
        var self = this;
        const $menus = this.$("[data-menu-id]");
        if (!$menus.length) {
            return Dialog.alert(self, _t('You cannot remove all the menu items of an app.\r\nTry uninstalling the app instead.'));
        }
        if (
            !_.isEmpty(this.to_move) ||
            !_.isEmpty(this.to_delete)
        ) {
            // do not make an rpc (and then reload menu) if there is nothing to save
            this._saveChanges().then(function () {
                self._reloadMenuData();
            });
        } else {
            this.close();
        }
    },
    /**
     * Save the current changes (in `to_move` and `to_delete`).
     *
     * @private
     * @returns {Promise}
     */
    _saveChanges: function () {
        return this._rpc({
            model: 'ir.ui.menu',
            method: 'customize',
            kwargs: {
                to_move: this.to_move,
                to_delete: this.to_delete,
            },
        });
    },
});

// The Many2One field is extended to catch when a model is quick created
// to avoid letting the user click on the save menu button
// before the model is created.
var EditMenuMany2One = Many2One.extend({
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     * @private
     */
    _quickCreate: function () {
        this.trigger_up('edit_menu_disable_save');
        var def = this._super.apply(this, arguments);
        Promise.resolve(def).then(this.trigger_up.bind(this, 'edit_menu_enable_save'),
                                  this.trigger_up.bind(this, 'edit_menu_enable_save'));

    },
});

const NewMenuDialog = CommonMenuDialog.extend({
    template: 'web_studio.EditMenu.Dialog.New',

    /**
     * @constructor
     * @param {Widget} parent
     * @param {Object} params
     * @param {function} params.on_saved - callback executed after saving
     * @param {String} confirmlabel - label of the create menu dialog
     */
    init: function (parent, params) {
        this.title = _t('Create a new Menu');
        this.confirmLabel = _t('Create Menu');
        this._super(...arguments);
    },
    /**
     * set buttons for the new menu dialog
     *
     * @override
     */
    async willStart() {
        await this._super(...arguments);
        this.set_buttons([{
            text: _t("Confirm"),
            classes: 'btn-primary confirm_button',
            click: this._onSave.bind(this)
        }, {
            text: _t("Cancel"),
            close: true
        }]);
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        var defs = [];
        this.opened().then(function () {
            self.$modal.addClass('o_web_studio_add_menu_modal');
            // focus on input
            self.$el.find('input[name="name"]').focus();
        });

        defs.push(this._super.apply(this, arguments));

        defs.push(this.model.makeRecord('ir.actions.act_window', [
            {
                name: 'model',
                relation: 'ir.model',
                type: 'many2one',
                domain: [['transient', '=', false], ['abstract', '=', false]],
            },
            {
                name: 'model_choice',
                type: 'selection',
                selection: [['new', _t('New Model')], ['existing', _t('Existing Model')], ['parent', _t('Parent Menu')]],
                value: 'new',
            }
        ]).then(function (recordID) {
            var options = {
                mode: 'edit',
            };
            var record = self.model.get(recordID);
            self.many2one = new EditMenuMany2One(self, 'model', record, options);
            self.many2one.nodeOptions.no_create_edit = !config.isDebug();
            self.many2one.nodeOptions.no_create = !config.isDebug();
            self._registerWidget(recordID, 'model', self.many2one);
            self.many2one.appendTo(self.$('.js_model'));
            self.model_choice = new FieldRadio(self, 'model_choice', record, options);
            self._registerWidget(recordID, 'model_choice', self.model_choice)
            self.model_choice.appendTo(self.$('.model_choice'));
            self._onChangeModelChoice();
        }));
        return Promise.all(defs);
    },
    /**
     * this method will create new menu and new model
     *
     * @private
     * @override
     * @param {String} menu_name
     */
    _doSave(menuName) {
        this._super(...arguments);
        const modelID = this.many2one.value && this.many2one.value.res_id;
        core.bus.trigger('clear_cache');
        return this._rpc({
            route: '/web_studio/create_new_menu',
            params: {
                menu_name: menuName,
                model_id: modelID,
                model_choice: this.model_choice.value,
                model_options: this.model_options,
                parent_menu_id: this.parent_menu_id,
                context: session.user_context,
            },
        });
    },

    /**
     * Handle the change of model choice (new or existing model). Change the dialog's confirm
     * button text label and hide or show the ir.model selection field depending on the selected
     * value.
     *
     * @private
     */
    _onChangeModelChoice: function() {
        const new_model = this.model_choice.value === 'new';
        this.set_buttons([{
            text: new_model? _t("Configure Model"):_t('Confirm'),
            classes: 'btn-primary confirm_button',
            click: new_model? this._onConfigureModel.bind(this):this._onSave.bind(this),
        }, {
            text: _t("Cancel"),
            close: true
        }]);
        this.$('.model_chooser').toggle(this.model_choice.value === 'existing');
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------


    /**
     * Handle the 'previous' button click on the ModelConfigurator
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onCancelOptions: function (ev) {
        this.$footer.find('.btn').removeClass('disabled').attr('disabled', null);
    },

    /**
     * Override of the 'field_changed' handler; make sure the model selection
     * field's visibility is modified whenever the model selection radio is updated.
     *
     * @private
     * @override
     * @param {OdooEvent} ev
     */
    _onFieldChanged: async function(ev) {
        const res = await StandaloneFieldManagerMixin._onFieldChanged.apply(this, arguments);
        this._onChangeModelChoice();
        return res;
    },
});

return {
    MenuItem: MenuItem,
    Dialog: EditMenuDialog,
};

});
