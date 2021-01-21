odoo.define('website.editMenu', function (require) {
'use strict';

var core = require('web.core');
var wysiwygLoader = require('web_editor.loader');
var websiteNavbarData = require('website.navbar');
var Dialog = require('web.Dialog');

var _t = core._t;

/**
 * Adds the behavior when clicking on the 'edit' button (+ editor interaction)
 */
var EditPageMenu = websiteNavbarData.WebsiteNavbarActionWidget.extend({
    assetLibs: ['web_editor.compiled_assets_wysiwyg', 'website.compiled_assets_wysiwyg'],

    xmlDependencies: ['/website/static/src/xml/website.editor.xml'],
    actions: _.extend({}, websiteNavbarData.WebsiteNavbarActionWidget.prototype.actions, {
        edit: '_startEditMode',
        on_save: '_onSave',
    }),
    custom_events: _.extend({}, websiteNavbarData.WebsiteNavbarActionWidget.custom_events || {}, {
        content_will_be_destroyed: '_onContentWillBeDestroyed',
        content_was_recreated: '_onContentWasRecreated',
        snippet_will_be_cloned: '_onSnippetWillBeCloned',
        snippet_cloned: '_onSnippetCloned',
        snippet_dropped: '_onSnippetDropped',
        edition_will_stopped: '_onEditionWillStop',
        edition_was_stopped: '_onEditionWasStopped',
        request_save: '_onSnippetRequestSave',
        request_cancel: '_onSnippetRequestCancel',
        get_clean_html: '_onGetCleanHTML',
        snippets_loaded: '_onSnippetLoaded',
    }),

    /**
     * @constructor
     */
    init: function () {
        this._super.apply(this, arguments);
        var context;
        this.trigger_up('context_get', {
            extra: true,
            callback: function (ctx) {
                context = ctx;
            },
        });
        this._editorAutoStart = (context.editable && window.location.search.indexOf('enable_editor') >= 0);
        var url = new URL(window.location.href);
        url.searchParams.delete('enable_editor');
        url.searchParams.delete('with_loader');
        window.history.replaceState({}, null, url);
    },
    /**
     * Auto-starts the editor if necessary or add the welcome message otherwise.
     *
     * @override
     */
    start: function () {
        var def = this._super.apply(this, arguments);

        // If we auto start the editor or if we start it in translate mode, do
        // not show a welcome message
        if (this._editorAutoStart || this._translateMode) {
            return Promise.all([def, this._startEditMode()]);
        }

        // Check that the page is empty
        var $wrap = this._targetForEdition().filter('#wrapwrap.homepage').find('#wrap');

        if ($wrap.length && $wrap.html().trim() === '') {
            // If readonly empty page, show the welcome message
            this.$welcomeMessage = $(core.qweb.render('website.homepage_editor_welcome_message'));
            this.$welcomeMessage.addClass('o_homepage_editor_welcome_message');
            this.$welcomeMessage.css('min-height', $wrap.parent('main').height() - ($wrap.outerHeight(true) - $wrap.height()));
            $wrap.empty().append(this.$welcomeMessage);
        }

        return def;
    },

    /**
     * Asks the snippets to clean themself, then saves the page, then reloads it
     * if asked to.
     *
     * @param {boolean} [reload=true]
     *        true if the page has to be reloaded after the save
     * @returns {Promise}
     */
    save: async function (reload = true) {
        if (this._saving) {
            return false;
        }
        this.observer.disconnect();
        var self = this;
        this._saving = true;
        this.trigger_up('edition_will_stopped');
        const destroy = () => {
            self.wysiwyg.destroy();
            self.trigger_up('edition_was_stopped');
            self.destroy();
        };
        if (!this.wysiwyg.isDirty()) return destroy();
        return this.wysiwyg.saveContent(false).then((result) => {
            var $wrapwrap = $('#wrapwrap');
            self.editableFromEditorMenu($wrapwrap).removeClass('o_editable');
            if (reload) {
                // remove top padding because the connected bar is not visible
                $('body').removeClass('o_connected_user');
                return self._reload();
            } else {
                destroy();
            }
            return true;
        }).guardedCatch(() => {
            this._saving = false;
        });
    },
    /**
     * Asks the user if they really wants to discard their changes (if any),
     * then simply reloads the page if they want to.
     *
     * @param {boolean} [reload=true]
     *        true if the page has to be reloaded when the user answers yes
     *        (do nothing otherwise but add this to allow class extension)
     * @returns {Deferred}
     */
    cancel: function (reload = true) {
        var self = this;
        var def = new Promise(function (resolve, reject) {
            if (!self.wysiwyg.isDirty()) {
                resolve();
            } else {
                var confirm = Dialog.confirm(self, _t("If you discard the current edits, all unsaved changes will be lost. You can cancel to return to edit mode."), {
                    confirm_callback: resolve,
                });
                confirm.on('closed', self, reject);
            }
        });

        return def.then(function () {
            self.trigger_up('edition_will_stopped');
            var $wrapwrap = $('#wrapwrap');
            self.editableFromEditorMenu($wrapwrap).removeClass('o_editable');
            if (reload) {
                window.onbeforeunload = null;
                self.wysiwyg.destroy();
                return self._reload();
            } else {
                self.wysiwyg.destroy();
                self.trigger_up('readonly_mode');
                self.trigger_up('edition_was_stopped');
                self.destroy();
            }
        });
    },
    // todo: understand what is the different compared to the method `editable()` of wysiwyg
    /**
     * Returns the editable areas on the page.
     *
     * @param {DOM} $wrapwrap
     * @returns {jQuery}
     */
    editableFromEditorMenu: function ($wrapwrap) {
        return $wrapwrap.find('[data-oe-model]')
            .not('.o_not_editable')
            .filter(function () {
                var $parent = $(this).closest('.o_editable, .o_not_editable');
                return !$parent.length || $parent.hasClass('o_editable');
            })
            .not('link, script')
            .not('[data-oe-readonly]')
            .not('img[data-oe-field="arch"], br[data-oe-field="arch"], input[data-oe-field="arch"]')
            .not('.oe_snippet_editor')
            .not('hr, br, input, textarea')
            .add('.o_editable');
    },

    //--------------------------------------------------------------------------
    // Actions
    //--------------------------------------------------------------------------

    /**
     * Creates an editor instance and appends it to the DOM. Also remove the
     * welcome message if necessary.
     *
     * @private
     * @returns {Promise}
     */
    _startEditMode: async function () {
        var self = this;
        if (this.editModeEnable) {
            return;
        }
        this.trigger_up('widgets_stop_request', {
            $target: this._targetForEdition(),
        });
        if (this.$welcomeMessage) {
            this.$welcomeMessage.detach(); // detach from the readonly rendering before the clone by summernote
        }
        this.editModeEnable = true;

        await this._createWysiwyg();

        this._addEditorMessages();
        var res = await new Promise(function (resolve, reject) {
            self.trigger_up('widgets_start_request', {
                editableMode: true,
                onSuccess: resolve,
                onFailure: reject,
            });
        });
        // Trigger a mousedown on the main edition area to focus it,
        // which is required for Summernote to activate.
        this.$editorMessageElements.mousedown();

        const $loader = $('div.o_theme_install_loader_container');
        if ($loader) {
            $loader.remove();
        }

        return res;
    },
    /**
     * On save, the editor will ask to parent widgets if something needs to be
     * done first. The website navbar will receive that demand and asks to its
     * action-capable components to do something. For example, the content menu
     * handles page-related options saving. However, some users with limited
     * access rights do not have the content menu... but the website navbar
     * expects that the save action is performed. So, this empty action is
     * defined here so that all users have an 'on_save' related action.
     *
     * @private
     * @todo improve the system to somehow declare required/optional actions
     */
    _onSave: function () {},

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    async _createWysiwyg() {
        var $wrapwrap = $('#wrapwrap');
        $wrapwrap.removeClass('o_editable'); // clean the dom before edition
        this.editableFromEditorMenu($wrapwrap).addClass('o_editable');

        this.wysiwyg = await this._wysiwygInstance();

        await this.wysiwyg.attachTo($('#wrapwrap')).then(() => {
            this.trigger_up('edit_mode');
            this.$el.css({width: ''});
        });

        const oeStructureSelector = '.oe_structure[data-oe-xpath][data-oe-id]';
        const oeFieldSelector = '[data-oe-field]';
        const savableSelector = `${oeStructureSelector}, ${oeFieldSelector}`;

        // Only make the odoo structure and fields editable.
        this.wysiwyg.odooEditor.observerUnactive();
        $('#wrapwrap').on('click.odoo-website-editor', '*', this, this._preventDefault);
        $('#wrapwrap').attr('contenteditable', 'false');
        $('#wrapwrap *').each((key, el) => {delete el.ouid});
        $(savableSelector).attr('contenteditable', 'true');
        this.wysiwyg.odooEditor.idSet($('#wrapwrap')[0]);
        this.wysiwyg.odooEditor.observerActive();

        // Observe changes to mark dirty structures and fields.
        this.observer = new MutationObserver(records => {
            for (const record of records) {
                const $savable = $(record.target).closest(savableSelector);

                // Filter out:
                // 1) Sizzle trigger many attribute mutation that does not
                //    really change anything.
                // 2) Some code change attribute on odoo fields that should be
                //    discarded because they will not be saved.
                if (
                    record.type === 'attributes' &&
                    (record.oldValue === record.target.getAttribute(record.attributeName) ||
                        $savable.is(oeFieldSelector))
                ) {
                    continue;
                }

                this.wysiwyg.odooEditor.observerUnactive();
                const c = $savable
                    .not('.o_dirty').addClass('o_dirty');
                this.wysiwyg.odooEditor.observerActive();
            }
        });

        this.observer.observe($('#wrapwrap')[0], {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            characterData: true,
        });
    },
    /**
     * Call preventDefault of an event.
     *
     * @private
     */
    _preventDefault(e) {
        e.preventDefault();
    },
    /**
     * Adds automatic editor messages on drag&drop zone elements.
     *
     * @private
     */
    _addEditorMessages: function () {
        var $target = this._targetForEdition();
        this.$editorMessageElements = $target
            .find('.oe_structure.oe_empty, [data-oe-type="html"]')
            .not('[data-editor-message]')
            .attr('data-editor-message', _t('DRAG BUILDING BLOCKS HERE'));
    },
    /**
     * Returns the target for edition.
     *
     * @private
     * @returns {JQuery}
     */
    _targetForEdition: function () {
        return $('#wrapwrap'); // TODO should know about this element another way
    },
    /**
     * Reloads the page in non-editable mode, with the right scrolling.
     *
     * @private
     * @returns {Deferred} (never resolved, the page is reloading anyway)
     */
    _reload: function () {
        $('body').addClass('o_wait_reload');
        this.wysiwyg.destroy();
        this.$el.hide();
        window.location.hash = 'scrollTop=' + window.document.body.scrollTop;
        window.location.reload(true);
        return new Promise(function () {});
    },
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
            snippets: 'website.snippets',
            recordInfo: {
                context: context,
                data_res_model: 'website',
                data_res_id: context.website_id,
            },
            enableWebsite: true,
            discardButton: true,
            saveButton: true,
            devicePreview: true,
        };
        return wysiwygLoader.createWysiwyg(this, params, ['website.compiled_assets_wysiwyg']);
    },


    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when content will be destroyed in the page. Notifies the
     * WebsiteRoot that is should stop the public widgets.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onContentWillBeDestroyed: function (ev) {
        this.trigger_up('widgets_stop_request', {
            $target: ev.data.$target,
        });
    },
    /**
     * Called when content was recreated in the page. Notifies the
     * WebsiteRoot that is should start the public widgets.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onContentWasRecreated: function (ev) {
        this.trigger_up('widgets_start_request', {
            editableMode: true,
            $target: ev.data.$target,
        });
    },
    /**
     * Called when edition will stop. Notifies the
     * WebsiteRoot that is should stop the public widgets.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onEditionWillStop: function (ev) {
        this.$editorMessageElements && this.$editorMessageElements.removeAttr('data-editor-message');
        this.trigger_up('widgets_stop_request', {
            $target: this._targetForEdition(),
        });
    },
    /**
     * Called when edition was stopped. Notifies the
     * WebsiteRoot that is should start the public widgets.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onEditionWasStopped: function (ev) {
        this.trigger_up('widgets_start_request', {
            $target: this._targetForEdition(),
        });
        this.editModeEnable = false;
    },
    /**
     * Called when a snippet is about to be cloned in the page. Notifies the
     * WebsiteRoot that is should destroy the animations for this snippet.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onSnippetWillBeCloned: function (ev) {
        this.trigger_up('widgets_stop_request', {
            $target: ev.data.$target,
        });
    },
    /**
     * Called when a snippet is cloned in the page. Notifies the WebsiteRoot
     * that is should start the public widgets for this snippet and the snippet it
     * was cloned from.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onSnippetCloned: function (ev) {
        this.trigger_up('widgets_start_request', {
            editableMode: true,
            $target: ev.data.$target,
        });
        // TODO: remove in saas-12.5, undefined $origin will restart #wrapwrap
        if (ev.data.$origin) {
            this.trigger_up('widgets_start_request', {
                editableMode: true,
                $target: ev.data.$origin,
            });
        }
    },
    /**
     * Called when a snippet is dropped in the page. Notifies the WebsiteRoot
     * that is should start the public widgets for this snippet. Also add the
     * editor messages.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onSnippetDropped: function (ev) {
        this.trigger_up('widgets_start_request', {
            editableMode: true,
            $target: ev.data.$target,
        });
        this._addEditorMessages();
    },
    /**
     * Get the cleaned value of the editable element.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onGetCleanHTML: function (ev) {
        ev.data.callback(this.wysiwyg.getValue({$layout: ev.data.$layout}));
    },
    /**
     * Snippet (menu_data) can request to save the document to leave the page
     *
     * @private
     * @param {OdooEvent} ev
     * @param {object} ev.data
     * @param {function} ev.data.onSuccess
     * @param {function} ev.data.onFailure
     */
    _onSnippetRequestSave: function (ev) {
        ev.stopPropagation();
        this.save(ev.data.reload).then(ev.data.onSuccess, ev.data.onFailure);
    },
    _onSnippetRequestCancel: function (ev) {
        ev.stopPropagation();
        this.cancel();
    },
    _onSnippetLoaded: function (ev) {
        $('body.editor_enable').addClass('editor_has_snippets');
    },
});

websiteNavbarData.websiteNavbarRegistry.add(EditPageMenu, '#edit-page-menu');

return EditPageMenu;
});
