odoo.define('web_studio.CommonMenuDialog', function (require) {
"use strict";

const Dialog = require('web.Dialog');
const { ModelConfiguratorDialog } = require('web_studio.ModelConfigurator');
const StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');


const CommonMenuDialog = Dialog.extend(StandaloneFieldManagerMixin, {
    custom_events: Object.assign({}, Dialog.prototype.custom_events, StandaloneFieldManagerMixin.custom_events, {
        edit_menu_disable_save: function () {
            this.$footer.find('.confirm_button').attr("disabled", "disabled");
        },
        edit_menu_enable_save: function () {
            this.$footer.find('.confirm_button').removeAttr("disabled");
        },
        confirm_options: '_onConfirmOptions',
        cancel_options: '_onCancelOptions',
    }),

    /**
     * @constructor
     * @param {Widget} parent
     * @param {Object} params
     * @param {function} [params.on_saved] Callback method called upon confirmation
     *
     */

    init(parent, params) {
        this.on_saved = params.on_saved || function () {};
        this.parent_menu_id = params.parent_menu_id;
        this.options = {
            title: this.title,
            size: 'small',
        };
        this._super(parent, this.options);
        StandaloneFieldManagerMixin.init.call(this);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Open the ModelConfigurator when the user confirm the creation of a new model
     *
     * @private
     */
    async _onConfigureModel() {
        this.$footer.find('.btn').attr('disabled', '').addClass('disabled');
        this.modelConfiguratorDialog = new ModelConfiguratorDialog(this, { confirmLabel: this.confirmLabel });
        this.modelConfiguratorDialog.open();
    },

    /**
     * Handle the 'previous' button click on the ModelConfigurator
     *
     * @private
     * @param {OdooEvent} ev
     */

    _onCancelOptions(ev) {
        this.$footer.find('.btn').removeClass('disabled').attr('disabled', null);
    },

    /**
     * Handle the confirmation of the ModelConfigurator, save the selected options
     * and continue the flow.
     *
     * @private
     * @param {OdooEvent} ev
     */

    async _onConfirmOptions(ev) {
        this.model_options = Object.entries(ev.data).filter(opt => opt[1].value).map(opt => opt[0]);
        return this._onSave().then((res) => {
            this.modelConfiguratorDialog.close();
            this.close();
            return res;
        }).guardedCatch(() =>
            this.modelConfiguratorDialog.close());
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Creates the new menu.
     *
     * @private
     */
    _onSave() {
        this.$footer.find('.btn').attr('disabled', '').addClass('disabled');
        const name = this.el.querySelector('input').value;
        return this._doSave(name).then((menu) => {
            this.on_saved(menu);
        }).guardedCatch(() => {
            this.$footer.find('.btn').removeAttr('disabled').removeClass('disabled');
        });
    },
    /**
     * @private
     * @param {String} menuName
     */
    _doSave(menuName) {
        
    },
});

return CommonMenuDialog;

});
