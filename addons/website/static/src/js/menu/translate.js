odoo.define('website.translateMenu', function (require) {
'use strict';

require('web.dom_ready');
var Dialog = require('web.Dialog');
var EditorMenu = require('website.editMenu');
var localStorage = require('web.local_storage');
var websiteNavbarData = require('website.navbar');

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

var TranslatePageMenu = websiteNavbarData.WebsiteNavbarActionWidget.extend({
    assetLibs: ['web_editor.compiled_assets_wysiwyg', 'website.compiled_assets_wysiwyg'],

    actions: _.extend({}, websiteNavbarData.WebsiteNavbar.prototype.actions || {}, {
        edit_master: '_goToMasterPage',
        translate: '_startTranslateMode',
    }),

    /**
     * @override
     */
    start: function () {
        var context;
        this.trigger_up('context_get', {
            extra: true,
            callback: function (ctx) {
                context = ctx;
            },
        });
        this._mustEditTranslations = context.edit_translations;
        if (this._mustEditTranslations) {
            var url = new URL(window.location.href);
            url.searchParams.delete('edit_translations');
            window.history.replaceState({}, null, url);

            this._startTranslateMode();
        }
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Actions
    //--------------------------------------------------------------------------

    /**
     * Redirects the user to the same page but in the original language and in
     * edit mode.
     *
     * @private
     * @returns {Promise}
     */
    _goToMasterPage: function () {
        var current = document.createElement('a');
        current.href = window.location.toString();
        current.search += (current.search ? '&' : '?') + 'enable_editor=1';
        // we are in translate mode, the pathname starts with '/<url_code/'
        current.pathname = current.pathname.substr(Math.max(0, current.pathname.indexOf('/', 1)));

        var link = document.createElement('a');
        link.href = '/website/lang/default';
        link.search += (link.search ? '&' : '?') + 'r=' + encodeURIComponent(current.pathname + current.search + current.hash);

        window.location = link.href;
        return new Promise(function () {});
    },
    /**
     * Redirects the user to the same page in translation mode (or start the
     * translator is translation mode is already enabled).
     *
     * @private
     * @returns {Promise}
     */
    _startTranslateMode: function () {
        if (!this._mustEditTranslations) {
            window.location.search += '&edit_translations';
            return new Promise(function () {});
        }

        const params = {
            enableTranslation: true,
            devicePreview: false,
        };

        var translator = new EditorMenu(this, {
            wysiwygOptions: params,
            savableSelector: '[data-oe-model][data-oe-translation-id][data-oe-translation-state]',
        });

        // We don't want the BS dropdown to close
        // when clicking in a element to translate
        $('.dropdown-menu').on('click', '.o_editable', function (ev) {
            ev.stopPropagation();
        });

        if (!localStorage.getItem(localStorageNoDialogKey)) {
            new TranslatorInfoDialog(translator).open();
        }

        translator.prependTo(document.body).then(() => {
            translator._startEditMode();
        });
    },
});

websiteNavbarData.websiteNavbarRegistry.add(TranslatePageMenu, '.o_menu_systray:has([data-action="translate"])');
});
