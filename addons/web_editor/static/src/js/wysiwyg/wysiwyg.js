odoo.define('web_editor.wysiwyg', function (require) {
'use strict';
const Widget = require('web.Widget');
const customColors = require('web_editor.custom_colors');
const concurrency = require('web.concurrency');
const weContext = require('web_editor.context');
const OdooEditor = require('web_editor.odoo-editor').OdooEditor;
const snippetsEditor = require('web_editor.snippet.editor');
const Toolbar = require('web_editor.toolbar');
const weWidgets = require('wysiwyg.widgets');

var id = 0;
const faZoomClassRegex = RegExp('fa-[0-9]x');

const Wysiwyg = Widget.extend({
    xmlDependencies: [
    ],
    defaultOptions: {
        'focus': false,
        'toolbar': [
            ['style', ['style']],
            ['font', ['bold', 'italic', 'underline', 'clear']],
            ['fontsize', ['fontsize']],
            ['color', ['color']],
            ['para', ['ul', 'ol', 'paragraph']],
            ['table', ['table']],
            ['insert', ['link', 'picture']],
            ['history', ['undo', 'redo']],
        ],
        'styleWithSpan': false,
        'inlinemedia': ['p'],
        'lang': 'odoo',
        'colors': customColors,
        recordInfo: {
            context: {},
        },
    },
    /**
     * @options {Object} options
     * @options {Object} options.recordInfo
     * @options {Object} options.recordInfo.context
     * @options {String} [options.recordInfo.context]
     * @options {integer} [options.recordInfo.res_id]
     * @options {String} [options.recordInfo.data_res_model]
     * @options {integer} [options.recordInfo.data_res_id]
     *   @see _getAttachmentsDomain in /wysiwyg/widgets/media.js
     * @options {Object} options.attachments
     *   @see _getAttachmentsDomain in /wysiwyg/widgets/media.js (for attachmentIDs)
     * @options {function} options.generateOptions
     *   called with the summernote configuration object used before sending to summernote
     *   @see _editorOptions
     **/
    init: function (parent, options) {
        this._super.apply(this, arguments);
        this.id = ++id;
        this.options = options;
        // autohideToolbar is true by default.
        this.options.autohideToolbar = typeof this.options.autohideToolbar === 'boolean'
            ? this.options.autohideToolbar
            : true;
        this.saving_mutex = new concurrency.Mutex();
    },
    /**
     *
     * @override
     */
    start: async function () {
        const _super = this._super;
        const self = this;

        var options = this._editorOptions();
        this._value = options.value;

        this.$editable = this.$editable || this.$el;
        this.$editable.html(this._value);
        this.$editable.data('wysiwyg', this);
        this.$editable.data('oe-model', options.recordInfo.res_model);
        this.$editable.data('oe-id', options.recordInfo.res_id);
        $(document).on('mousedown', this._blur);
        this.$editable.on('blur', () => {
            console.log('trigger blur');
            this.trigger_up('wysiwyg_blur');
        });

        this.toolbar = new Toolbar(this, this.options.toolbarTemplate);
        await this.toolbar.appendTo(document.createElement('void'));
        this.odooEditor = new OdooEditor(this.$editable[0], {
            toolbar: this.toolbar.$el[0],
            document: this.options.document,
            autohideToolbar: !!this.options.autohideToolbar,
            setContentEditable: this.options.setContentEditable,
        });

        this._configureToolbar(options);

        this.$editable.on('dblclick','img,.fa', function(e){
            const $el = $(this);
            let params = {"node" : $el};
            if( $el.is('.fa')) {
                // save layouting classes from icons to not break the page if you edit an icon
                params.htmlClass = [...$el[0].classList].filter((className) => {
                    return !className.startsWith('fa') || faZoomClassRegex.test(className);
                }).join(' ');
            }
            self.openMediaDialog(params);
        });

        if (options.snippets) {
            $('body').addClass('editor_enable');
            this.snippetsMenu = new snippetsEditor.SnippetsMenu(this, Object.assign({
                wysiwyg: this,
                selectorEditableArea: '.o_editable',
            }, options));
            this._insertSnippetMenu();

            this.snippetsMenu.on('update_customize_elements', this, (e) => {
                this.lastTargetedElement = e.target.$target
                // only show the description button in the toolbar if the current selected snippet is an image
                $("#media-description").toggle(this.lastTargetedElement.is('img'));

            });
        }

        return _super.apply(this, arguments).then(() => {
            $(document.body).append(this.toolbar.$el);
        });
    },
    /**
     * @override
     */
    destroy: function () {
        $(document).off('mousedown', this._blur);
        const $body = $(document.body);
        $body.off('mousedown', this.resizerMousemove);
        $body.off('mouseup', this.resizerMouseup);
        this._super();
    },
    /**
     * @override
     */
    renderElement: function() {
        this.$editable = this.options.editable || $('<div class="note-editable">');

        if (this.options.resizable) {
            const $wrapper = $('<div class="o_wysiwyg_wrapper odoo-editor">');
            $wrapper.append(this.$editable);
            this.$resizer = $(`<div class="o_wysiwyg_resizer">
                <div class="o_wysiwyg_resizer_hook"></div>
                <div class="o_wysiwyg_resizer_hook"></div>
                <div class="o_wysiwyg_resizer_hook"></div>
            </div>`);
            $wrapper.append(this.$resizer);
            this._replaceElement($wrapper);

            const minHeight = this.options.minHeight || 100;
            this.$editable.height(this.options.height || minHeight);

            // resizer hooks
            let startOffsetTop;
            let startHeight;
            const $body = $(document.body);
            const resizerMousedown = (e) => {
                $body.on('mousemove', this.resizerMousemove);
                $body.on('mouseup', this.resizerMouseup);
                startHeight = this.$editable.height();
                startOffsetTop = e.pageY;
            };
            this.resizerMousemove = (e) => {
                console.log("e.pageY:", e.pageY);
                const offsetTop = e.pageY - startOffsetTop;
                console.log('offsetTop', offsetTop);
                let height = startHeight + offsetTop;
                console.log("height:", height);
                if (height < minHeight) height = minHeight;
                this.$editable.height(height);
            };
            this.resizerMouseup = () => {
                console.log('off')
                $body.off('mousemove', this.resizerMousemove);
                $body.off('mouseup', this.resizerMouseup);
            };
            this.$resizer.on('mousedown', resizerMousedown)
        } else {
            this._replaceElement(this.$editable);
        }
    },
    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------
    /**
     * Return the editable area.
     *
     * @returns {jQuery}
     */
    getEditable: function () {
        return this.$editable;
    },
    /**
     * Return true if the content has changed.
     *
     * @returns {Boolean}
     */
    isDirty: function () {
        return this._value !== (this.$editable.html() || this.$editable.val());
    },
    /**
     * Set the focus on the element.
     */
    focus: function () {
        console.log('focus');
    },
    /**
     * Get the value of the editable element.
     *
     * @param {object} [options]
     * @param {jQueryElement} [options.$layout]
     * @returns {String}
     */
    getValue: function (options) {
        var $editable = options && options.$layout || this.$editable.clone();
        $editable.find('[contenteditable]').removeAttr('contenteditable');
        $editable.find('[class=""]').removeAttr('class');
        $editable.find('[style=""]').removeAttr('style');
        $editable.find('[title=""]').removeAttr('title');
        $editable.find('[alt=""]').removeAttr('alt');
        $editable.find('[data-original-title=""]').removeAttr('data-original-title');
        $editable.find('a.o_image, span.fa, i.fa').html('');
        $editable.find('[aria-describedby]').removeAttr('aria-describedby').removeAttr('data-original-title');
        return $editable.html();
    },
    /**
     * Save the content in the target
     *      - in init option beforeSave
     *      - receive editable jQuery DOM as attribute
     *      - called after deactivate codeview if needed
     * @returns {Promise}
     *      - resolve with true if the content was dirty
     */
    save: function () {
        var isDirty = this.isDirty();
        var html = this.getValue();
        if (this.$editable.is('textarea')) {
            this.$editable.val(html);
        } else {
            this.$editable.html(html);
        }
        return Promise.resolve({isDirty:isDirty, html:html});
    },
    /**
     * Save the content for the normal mode or the translation mode.
     */
    saveContent: async function (reload = true) {
        await this.saveToServer(reload);
    },
    /**
     * Reset the history.
     */
    resetHistory: function () {
        this.odooEditor.resetHistory();
    },

    /**
     * Save the content to the server for the normal mode.
     */
    saveToServer: async function (reload = true) {
        const defs = [];
        this.trigger_up('edition_will_stopped');
        this.trigger_up('ready_to_save', {defs: defs});
        await Promise.all(defs);

        if (this.snippetsMenu) {
            await this.snippetsMenu.cleanForSave();
        }

        // await this._saveModifiedImages();
        await this._saveViewBlocks();
        // await this._saveCoverPropertiesBlocks();
        // await this._saveMegaMenuClasses();

        this.trigger_up('edition_was_stopped');
        window.onbeforeunload = null;
        if (reload) {
            window.location.reload();
        }
    },
    /**
     * Asks the user if he really wants to discard its changes (if there are
     * some of them), then simply reload the page if he wants to.
     *
     * @param {boolean} [reload=true]
     *        true if the page has to be reloaded when the user answers yes
     *        (do nothing otherwise but add this to allow class extension)
     * @returns {Promise}
     */
    cancel: function (reload) {
        var self = this;
        return new Promise((resolve, reject) => {
            if (!this.odooEditor.history.length) {
                resolve();
            } else {
                var confirm = Dialog.confirm(this, _t("If you discard the current edits, all unsaved changes will be lost. You can cancel to return to edit mode."), {
                    confirm_callback: resolve,
                });
                confirm.on('closed', self, reject);
            }
        }).then(function () {
            if (reload !== false) {
                window.onbeforeunload = null;
                return self._reload();
            }
        });
    },
    /**
     * Create/Update cropped attachments.
     *
     * @param {jQuery} $editable
     * @returns {Promise}
     */
    saveModifiedImages: function ($editable) {
        const defs = _.map($editable, async editableEl => {
            const {oeModel: resModel, oeId: resId} = editableEl.dataset;
            const proms = [...editableEl.querySelectorAll('.o_modified_image_to_save')].map(async el => {
                const isBackground = !el.matches('img');
                el.classList.remove('o_modified_image_to_save');
                // Modifying an image always creates a copy of the original, even if
                // it was modified previously, as the other modified image may be used
                // elsewhere if the snippet was duplicated or was saved as a custom one.
                const newAttachmentSrc = await this._rpc({
                    route: `/web_editor/modify_image/${el.dataset.originalId}`,
                    params: {
                        res_model: resModel,
                        res_id: parseInt(resId),
                        data: (isBackground ? el.dataset.bgSrc : el.getAttribute('src')).split(',')[1],
                    },
                });
                if (isBackground) {
                    $(el).css('background-image', `url('${newAttachmentSrc}')`);
                    delete el.dataset.bgSrc;
                } else {
                    el.setAttribute('src', newAttachmentSrc);
                }
            });
            return Promise.all(proms);
        });
        return Promise.all(defs);
    },
    /**
     * @param {String} value
     * @param {Object} options
     * @param {Boolean} [options.notifyChange]
     * @returns {String}
     */
    setValue: function (value, options) {
        if (this.$editable.is('textarea')) {
            this.$editable.val(value);
        } else {
            this.$editable.html(value);
        }
        this.$editable.html(value);
    },
    /**
     * Undo one step of change in the editor.
     */
    undo: function () {
        this.odooEditor.historyUndo();
    },
    /**
     * Redo one step of change in the editor.
     */
    redo: function () {
        this.odooEditor.historyRedo();
    },
    /**
     * Open the Alt dialog.
     * 
     * Dialog give access to edit <img> alt and title.
     *
     * @param {object} params
     * @param {Node} [params.node] Optionnal
     */
    openAltDialog(params = {}) {
        const $baseNode = params.node ? params.node : this.lastTargetedElement;
        const altDialog = new weWidgets.AltDialog(this, params, $baseNode);
        altDialog.open();
    },
    /**
     * Open the media dialog.
     *
     * Used to insert or change image, icon, document and video.
     * 
     * @param {object} params
     * @param {Node} [params.node] Optionnal
     * @param {Node} [params.htmlClass] Optionnal
     */
    openMediaDialog(params = {}) {
        const range = Wysiwyg.getRange();
        // we loose the current selection inside the content editable
        // when we click on the media dialog button
        // so we need to be able to restore the selection when the modal is closed
        const restoreSelection = function() {
            if(range.sc === null) return;
            Wysiwyg.setRange(range.sc, range.so, range.ec, range.eo);
        }

        const $baseNode = params.node ? params.node : this.lastTargetedElement;
        const mediaDialog = new weWidgets.MediaDialog(this, params, $baseNode);
        mediaDialog.open();

        mediaDialog.on('save', this, function(element) {
            // restore saved html classes
            if (params.htmlClass) {element.className += " " + params.htmlClass;}
            if (this.lastTargetedElement.is('img') || params.node) {
                $baseNode.replaceWith(element.outerHTML);
            } else {
                restoreSelection();
                document.execCommand('insertHTML', false, element.outerHTML);
            }
        });
        mediaDialog.on('closed', this,  function() {
            // if the mediaDialog content has been saved
            // the previous selection in not relevant anymore
            if (mediaDialog.destroyAction !== 'save') {restoreSelection();}
        });
    },
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _configureToolbar: function (options) {
        let $toolbar = $(this.odooEditor.toolbar);
        const openModal = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.target.id === 'media-modal' ? this.openMediaDialog() : this.openAltDialog();
        };
        $toolbar.find('#media-modal').click(openModal);
        $toolbar.find('#media-description').click(openModal);
    },
    _editorOptions: function () {
        var self = this;
        var options = Object.assign({},  this.defaultOptions, this.options);
        if (this.options.generateOptions) {
            options = this.options.generateOptions(options);
        }
        options.airPopover = options.toolbar;
        options.onChange = function (html, $editable) {
            $editable.trigger('content_changed');
            self.trigger_up('wysiwyg_change');
        };
        options.onUpload = function (attachments) {
            self.trigger_up('wysiwyg_attachment', attachments);
        };
        options.onFocus = function () {
            self.trigger_up('wysiwyg_focus');
        };
        options.onBlur = function () {
            self.trigger_up('wysiwyg_blur');
        };
        return options;
    },
    _insertSnippetMenu: function() {
        return this.snippetsMenu.insertAfter(this.$el);
    },
    /**
     * If the element holds a translation, saves it. Otherwise, fallback to the
     * standard saving but with the lang kept.
     *
     * @override
     */
    _saveTranslationElement: function ($el, context, withLang = true) {
        if ($el.data('oe-translation-id')) {
            return this._rpc({
                model: 'ir.translation',
                method: 'save_html',
                args: [
                    [+$el.data('oe-translation-id')],
                    this._getEscapedElement($el).html()
                ],
                context: context,
            });
        } else {
            var viewID = $el.data('oe-id');
            if (!viewID) {
                return Promise.resolve();
            }

            return this._rpc({
                model: 'ir.ui.view',
                method: 'save',
                args: [
                    viewID,
                    this._getEscapedElement($el).prop('outerHTML'),
                    !$el.data('oe-expression') && $el.data('oe-xpath') || null, // Note: hacky way to get the oe-xpath only if not a t-field
                ],
                context: context,
            }, withLang ? undefined : {
                noContextKeys: 'lang',
            });
        }
    },

    //--------------------------------------------------------------------------
    //--------------------------------------------------------------------------
    //--------------------------------------------------------------------------
    // Previously on rte.js
    //--------------------------------------------------------------------------
    //--------------------------------------------------------------------------
    //--------------------------------------------------------------------------

    /**
     * Returns the editable areas on the page.
     *
     * @returns {jQuery}
     */
    editable: function () {
        return $('#wrapwrap [data-oe-model]')
            .not('.o_not_editable')
            .filter(function () {
                return !$(this).closest('.o_not_editable').length;
            })
            .not('link, script')
            .not('[data-oe-readonly]')
            .not('img[data-oe-field="arch"], br[data-oe-field="arch"], input[data-oe-field="arch"]')
            .not('.oe_snippet_editor')
            .add('.o_editable');
    },

    /**
     * Searches all the dirty element on the page and saves them one by one. If
     * one cannot be saved, this notifies it to the user and restarts rte
     * edition.
     *
     * @param {Object} [context] - the context to use for saving rpc, default to
     *                           the editor context found on the page
     * @return {Promise} rejected if the save cannot be done
     */
    _saveViewBlocks: function (context) {
        $('.o_editable')
            .removeClass('o_editable o_is_inline_editable o_editable_date_field_linked o_editable_date_field_format_changed');

        const $allBlocks = $((this.options || {}).savableSelector).filter('.o_dirty');

        const $dirty = $('.o_dirty');
        $dirty
            .removeAttr('contentEditable')
            .removeClass('o_dirty oe_carlos_danger o_is_inline_editable');

        const defs = _.map($allBlocks, (el) => {
            const $el = $(el);

            $el.find('[class]').filter(function () {
                if (!this.getAttribute('class').match(/\S/)) {
                    this.removeAttribute('class');
                }
            });

            // TODO: Add a queue with concurrency limit in webclient
            return this.saving_mutex.exec(() => {
                let saveElement = '_saveElement';
                if (this.options.enableTranslation) {
                    saveElement = '_saveTranslationElement';
                }
                return this[saveElement]($el, context || weContext.get())
                .then(function () {
                    $el.removeClass('o_dirty');
                }).guardedCatch(function (response) {
                    // because ckeditor regenerates all the dom, we can't just
                    // setup the popover here as everything will be destroyed by
                    // the DOM regeneration. Add markings instead, and returns a
                    // new rejection with all relevant info
                    var id = _.uniqueId('carlos_danger_');
                    $el.addClass('o_dirty oe_carlos_danger ' + id);
                    $('.o_editable.' + id)
                        .removeClass(id)
                        .popover({
                            trigger: 'hover',
                            content: response.message.data.message || '',
                            placement: 'auto top',
                        })
                        .popover('show');
                });
            });
        });
        return Promise.all(defs).then(function () {
            window.onbeforeunload = null;
        }).guardedCatch((failed) => {
            console.log(failed)
            // If there were errors, re-enable edition
            this.cancel();
            this.start();
        });
    },

    _attachTooltips: function () {
        $(document.body)
            .tooltip({
                selector: '[data-oe-readonly]',
                container: 'body',
                trigger: 'hover',
                delay: { 'show': 1000, 'hide': 100 },
                placement: 'bottom',
                title: _t("Readonly field")
            })
            .on('click', function () {
                $(this).tooltip('hide');
            });
    },
    /**
     * Gets jQuery cloned element with internal text nodes escaped for XML
     * storage.
     *
     * @private
     * @param {jQuery} $el
     * @return {jQuery}
     */
    _getEscapedElement: function ($el) {
        var escaped_el = $el.clone();
        var to_escape = escaped_el.find('*').addBack();
        to_escape = to_escape.not(to_escape.filter('object,iframe,script,style,[data-oe-model][data-oe-model!="ir.ui.view"]').find('*').addBack());
        to_escape.contents().each(function () {
            if (this.nodeType === 3) {
                this.nodeValue = $('<div />').text(this.nodeValue).html();
            }
        });
        return escaped_el;
    },
    /**
     * Saves one (dirty) element of the page.
     *
     * @private
     * @param {jQuery} $el - the element to save
     * @param {Object} context - the context to use for the saving rpc
     * @param {boolean} [withLang=false]
     *        false if the lang must be omitted in the context (saving "master"
     *        page element)
     */
    _saveElement: function ($el, context, withLang) {
        var viewID = $el.data('oe-id');
        if (!viewID) {
            return Promise.resolve();
        }

        return this._rpc({
            model: 'ir.ui.view',
            method: 'save',
            args: [
                viewID,
                this._getEscapedElement($el).prop('outerHTML'),
                !$el.data('oe-expression') && $el.data('oe-xpath') || null, // Note: hacky way to get the oe-xpath only if not a t-field
            ],
            context: context,
        }, withLang ? undefined : {
            noContextKeys: 'lang',
        });
    },

    /**
     * Reloads the page in non-editable mode, with the right scrolling.
     *
     * @private
     * @returns {Promise} (never resolved, the page is reloading anyway)
     */
    _reload: function () {
        window.location.hash = 'scrollTop=' + window.document.body.scrollTop;
        if (window.location.search.indexOf('enable_editor') >= 0) {
            window.location.href = window.location.href.replace(/&?enable_editor(=[^&]*)?/g, '');
        } else {
            window.location.reload(true);
        }
        return new Promise(function(){});
    },
});
//--------------------------------------------------------------------------
// Public helper
//--------------------------------------------------------------------------
/**
 * @param {Node} node (editable or node inside)
 * @returns {Object}
 * @returns {Node} sc - start container
 * @returns {Number} so - start offset
 * @returns {Node} ec - end container
 * @returns {Number} eo - end offset
 */
Wysiwyg.getRange = function () {
    const selection = document.getSelection();
    if (selection.rangeCount === 0) {
        return {
            sc: null,
            so: 0,
            ec: null,
            eo: 0,
        }
    }
    const range = selection.getRangeAt(0);

    return {
        sc: range.startContainer,
        so: range.startOffset,
        ec: range.endContainer,
        eo: range.endOffset,
    };
};
/**
 * @param {Node} startNode
 * @param {Number} startOffset
 * @param {Node} endNode
 * @param {Number} endOffset
 */
Wysiwyg.setRange = function (startNode, startOffset = 0, endNode = startNode, endOffset = startOffset) {
    const selection = document.getSelection();
    selection.removeAllRanges();

    const range = new Range();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    selection.addRange(range);
};
return Wysiwyg;
});
odoo.define('web_editor.widget', function (require) {
'use strict';
    return {
        Dialog: require('wysiwyg.widgets.Dialog'),
        MediaDialog: require('wysiwyg.widgets.MediaDialog'),
        LinkDialog: require('wysiwyg.widgets.LinkDialog'),
    };
});
