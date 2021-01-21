odoo.define('website.editor.menu.translate', function (require) {
'use strict';

require('web.dom_ready');
var core = require('web.core');
var Dialog = require('web.Dialog');
var localStorage = require('web.local_storage');
var EditorMenu = require('website.editMenu');
var wysiwygLoader = require('web_editor.loader');

var _t = core._t;

var localStorageNoDialogKey = 'website_translator_nodialog';

var TranslatorInfoDialog = Dialog.extend({
    template: 'website.TranslatorInfoDialog',
    xmlDependencies: Dialog.prototype.xmlDependencies.concat(
        ['/website/static/src/xml/translator.xml']
    ),

    /**
     * @constructor
     */
    init: function (parent, options) {
        this._super(parent, _.extend({
            title: _t("Translation Info"),
            buttons: [
                {text: _t("Ok, never show me this again"), classes: 'btn-primary', close: true, click: this._onStrongOk.bind(this)},
                {text: _t("Ok"), close: true}
            ],
        }, options || {}));
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when the "strong" ok is clicked -> adapt localstorage to make sure
     * the dialog is never displayed again.
     *
     * @private
     */
    _onStrongOk: function () {
        localStorage.setItem(localStorageNoDialogKey, true);
    },
});

var TranslatorMenu = EditorMenu.extend({

    /**
     * @override
     */
    start: function () {
        this._translateMode = true;
        if (!localStorage.getItem(localStorageNoDialogKey)) {
            new TranslatorInfoDialog(this).open();
        }

        return this._super();
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Returns the editable areas on the page.
     *
     * @param {DOM} $wrapwrap
     * @returns {jQuery}
     */
    editable: function ($wrapwrap) {
    	var selector = '[data-oe-translation-id], '+
        	'[data-oe-model][data-oe-id][data-oe-field], ' +
        	'[placeholder*="data-oe-translation-id="], ' +
        	'[title*="data-oe-translation-id="], ' +
        	'[alt*="data-oe-translation-id="]';
        var $edit = $wrapwrap.find(selector);
        $edit.filter(':has(' + selector + ')').attr('data-oe-readonly', true);
        return $edit.not('[data-oe-readonly]');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _wysiwygInstance: function () {
        var context;
        this.trigger_up('context_get', {
            callback: function (ctx) {
                context = ctx;
            },
        });
        const params = {
            snippets: 'web_editor.snippets',
            recordInfo: {
                context: context,
                data_res_model: 'website',
                data_res_id: context.website_id,
            },
            enableWebsite: true,
            enableTranslation: true,
            discardButton: true,
            saveButton: true,
        };
        return wysiwygLoader.createWysiwyg(this, params, ['website.compiled_assets_wysiwyg']);
    },
});

return TranslatorMenu;
});
