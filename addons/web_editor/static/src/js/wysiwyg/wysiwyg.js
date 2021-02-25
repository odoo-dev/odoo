odoo.define('web_editor.wysiwyg', function (require) {
'use strict';
const core = require('web.core');
const Widget = require('web.Widget');
const Dialog = require('web.Dialog');
const customColors = require('web_editor.custom_colors');
const {ColorPaletteWidget} = require('web_editor.ColorPalette');
const {ColorpickerWidget} = require('web.Colorpicker');
const concurrency = require('web.concurrency');
const weContext = require('web_editor.context');
const OdooEditorLib = require('web_editor.odoo-editor');
const snippetsEditor = require('web_editor.snippet.editor');
const Toolbar = require('web_editor.toolbar');
const weWidgets = require('wysiwyg.widgets');

var _t = core._t;

const OdooEditor = OdooEditorLib.OdooEditor;
const isBlock = OdooEditorLib.isBlock;
const rgbToHex = OdooEditorLib.rgbToHex;

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
        // autohideToolbar is true by default (false by default if navbar present).
        this.options.autohideToolbar = typeof this.options.autohideToolbar === 'boolean'
            ? this.options.autohideToolbar
            : !options.snippets;
        this.saving_mutex = new concurrency.Mutex();
        this._onDocumentMousedown = this._onDocumentMousedown.bind(this);
        this._onBlur = this._onBlur.bind(this);
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
        document.addEventListener('mousedown', this._onDocumentMousedown, true);
        this.$editable.on('blur', this._onBlur);

        this.toolbar = new Toolbar(this, this.options.toolbarTemplate);
        await this.toolbar.appendTo(document.createElement('void'));
        this.odooEditor = new OdooEditor(this.$editable[0], {
            toolbar: this.toolbar.$el[0],
            document: this.options.document,
            autohideToolbar: !!this.options.autohideToolbar,
            setContentEditable: this.options.setContentEditable,
        });

        this._configureToolbar(options);
        this._observeOdooFieldChanges();
        this.$editable.on(
            'mousedown touchstart',
            '[data-oe-field]',
            function(e) {
                const $field = $(this);
                if (($field.data('oe-type') === "datetime" || $field.data('oe-type') === "date") && !$field.hasClass('o_editable_date_field_format_changed')) {
                    $field.html($field.data('oe-original-with-format'));
                    $field.addClass('o_editable_date_field_format_changed');
                }
                if ($field.data('oe-type') === "monetary") {
                    $field.attr('contenteditable', false);
                    $field.find('.oe_currency_value').attr('contenteditable', true);
                }
                if ($field.is('[data-oe-many2one-id]')) {
                    $field.attr('contenteditable', false);
                }
            }
        );
        // when focus in a link `<a>` switch the contenteditable property
        // from the main editor element to the focused link
        this.$editableWrap = this.$editable.find('#wrap');
        this.$editableWrap.on(
            'mousedown',
            'a:not([contenteditable=true])',
            (e) => {
                // In case we focus from a link directy into another,
                // we trigger the restore before changing the contenteditable
                // to ensure the main editor contenteditable state is correct.
                this._restoreMainContentEditable(e.target);
                this.odooEditor.automaticStepUnactive("linkEditionFix");
                this.$currentLinkEdition = $(e.target);
                this.$currentLinkEdition.attr("contenteditable", "true");
                this.$editableWrap.removeAttr('contenteditable');
                this.odooEditor.automaticStepActive("linkEditionFix");
            }
        );

        this.$editable.on('click','.o_image, .media_iframe_video', (e) => e.preventDefault());

        this.$editable.on('dblclick','img, .fa, .o_image, .media_iframe_video', function() {
            const $el = $(this);
            let params = {node: $el};
            $el.selectElement();

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
            await this._insertSnippetMenu();
        }

        $(this.odooEditor.dom).on('click', this._updateEditorUI.bind(this));
        $(this.odooEditor.dom).on('keydown', this._updateEditorUI.bind(this));

        return _super.apply(this, arguments).then(() => {
            $(document.body).append(this.toolbar.$el);
        });
    },
    /**
     * @override
     */
    destroy: function () {
        this.$editable && this.$editable.off('blur', this._onBlur);
        document.removeEventListener('mousedown', this._onDocumentMousedown, true);
        const $body = $(document.body);
        $body.off('mousemove', this.resizerMousemove);
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
                e.preventDefault();
                e.stopPropagation();
                $body.on('mousemove', this.resizerMousemove);
                $body.on('mouseup', this.resizerMouseup);
                startHeight = this.$editable.height();
                startOffsetTop = e.pageY;
            };
            this.resizerMousemove = (e) => {
                const offsetTop = e.pageY - startOffsetTop;
                let height = startHeight + offsetTop;
                if (height < minHeight) height = minHeight;
                this.$editable.height(height);
            };
            this.resizerMouseup = () => {
                $body.off('mousemove', this.resizerMousemove);
                $body.off('mouseup', this.resizerMouseup);
            };
            this.$resizer.on('mousedown', resizerMousedown);
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

        await this.saveModifiedImages();
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
    saveModifiedImages: function ($editable = this.$editable) {
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
     * Start or resume the Odoo field changes muation observers.
     *
     * Necessary to keep all copies of a given field at the same value throughout the page.
     */
    _observeOdooFieldChanges: function () {
        const observerOptions = { characterData:true, subtree: true, childList: true };
        if(this.odooFieldObservers) {
            for (let observerData of this.odooFieldObservers) {
                observerData.observer.observe(observerData.field, observerOptions);
            }
        } else {
            const odooFieldSelector = '[data-oe-model], [data-oe-translation-id]';
            const $odooFields = this.$editable.find(odooFieldSelector);
            this.odooFieldObservers = [];

            $odooFields.each((i, field) => {
                const observer = new MutationObserver(() => {
                    let $node = $(field)
                    let $nodes = $odooFields.filter(function () { return this !== field;});
                    if ($node.data('oe-model')) {
                        $nodes = $nodes.filter('[data-oe-model="'+$node.data('oe-model')+'"]')
                            .filter('[data-oe-id="'+$node.data('oe-id')+'"]')
                            .filter('[data-oe-field="'+$node.data('oe-field')+'"]');
                    }

                    if ($node.data('oe-translation-id')) $nodes = $nodes.filter('[data-oe-translation-id="'+$node.data('oe-translation-id')+'"]');
                    if ($node.data('oe-type')) $nodes = $nodes.filter('[data-oe-type="'+$node.data('oe-type')+'"]');
                    if ($node.data('oe-expression')) $nodes = $nodes.filter('[data-oe-expression="'+$node.data('oe-expression')+'"]');
                    else if ($node.data('oe-xpath')) $nodes = $nodes.filter('[data-oe-xpath="'+$node.data('oe-xpath')+'"]');
                    if ($node.data('oe-contact-options')) $nodes = $nodes.filter("[data-oe-contact-options='"+$node[0].dataset.oeContactOptions+"']");

                    let nodes = $node.get();

                    if ($node.data('oe-type') === "many2one") {
                        $nodes = $nodes.add($('[data-oe-model]')
                            .filter(function () { return this !== $node[0] && nodes.indexOf(this) === -1; })
                            .filter('[data-oe-many2one-model="'+$node.data('oe-many2one-model')+'"]')
                            .filter('[data-oe-many2one-id="'+$node.data('oe-many2one-id')+'"]')
                            .filter('[data-oe-type="many2one"]'));

                        $nodes = $nodes.add($('[data-oe-model]')
                            .filter(function () { return this !== $node[0] && nodes.indexOf(this) === -1; })
                            .filter('[data-oe-model="'+$node.data('oe-many2one-model')+'"]')
                            .filter('[data-oe-id="'+$node.data('oe-many2one-id')+'"]')
                            .filter('[data-oe-field="name"]'));
                    }

                    this._pauseOdooFieldObservers();
                    // Tag the date fields to only replace the value
                    // with the original date value once (see mouseDown event)
                    if($node.hasClass('o_editable_date_field_format_changed')) {
                        $nodes.addClass('o_editable_date_field_format_changed');
                    }
                    $nodes.html($node.html());
                    this._observeOdooFieldChanges();
                });
                observer.observe(field, observerOptions);
                this.odooFieldObservers.push({ field: field, observer: observer });
            });
        }
    },
    /**
     * Stop the field changes mutation observers.
     */
    _pauseOdooFieldObservers: function () {
        for (let observerData of this.odooFieldObservers) {
            observerData.observer.disconnect();
        }
    },
    /**
     * Toggle the Alt tools in the toolbar to edit <img> alt and title attributes.
     *
     * @param {object} params
     * @param {Node} [params.node]
     */
    toggleAltTools(params) {
        const image = (params && params.node) || this.lastImageClicked;
        if (this.snippetsMenu) {
            if (this.altTools) {
                this.altTools.destroy();
                this.altTools = undefined;
            } else {
                const $btn = this.toolbar.$el.find('#media-description');
                this.altTools = new weWidgets.AltTools(this, params, image, $btn);
                this.altTools.appendTo(this.toolbar.$el);
            }
        } else {
            const altDialog = new weWidgets.AltDialog(this, params, image);
            altDialog.open();
        }
    },
    /**
     * Toggle the Link tools/dialog to edit links. If a snippet menu is present,
     * use the link tools, otherwise use the dialog.
     */
    toggleLinkTools() {
        if (this.snippetsMenu) {
            if (this.linkTools) {
                this.linkTools.destroy();
                this.linkTools = undefined;
            } else {
                const $btn = this.toolbar.$el.find('#create-link');
                this.linkTools = new weWidgets.LinkTools(this, {}, this.odooEditor.dom, $btn);
                this.linkTools.appendTo(this.toolbar.$el);
            }
        } else {
            const linkDialog = new weWidgets.LinkDialog(this, {}, this.$editable[0]);
            linkDialog.open();
            linkDialog.on('save', this, (linkInfo) => {
                const linkUrl = linkInfo.url;
                const linkText = linkInfo.text;
                const isNewWindow = linkInfo.isNewWindow;

                const range = linkInfo.range;
                const hasTextChanged = range.toString() !== linkText;

                const ancestorAnchor = $(range.startContainer).closest('a')[0];
                let anchors = [];
                if (ancestorAnchor && ancestorAnchor === $(range.endContainer).closest('a')[0]) {
                    anchors.push($(ancestorAnchor).html(linkText).get(0));
                } else if (hasTextChanged) {
                    const anchor = $('<A>' + linkText + '</A>')[0];
                    range.insertNode(anchor);
                    anchors.push(anchor);
                } else {
                    const anchor = $('a')[0];
                    range.surroundContents(anchor);
                    anchors.push(anchor);
                }
                for (const anchor of anchors) {
                    $(anchor).attr('href', linkUrl);
                    $(anchor).attr('class', linkInfo.className || null);
                    $(anchor).css(linkInfo.style || {});
                    if (isNewWindow) {
                        $(anchor).attr('target', '_blank');
                    } else {
                        $(anchor).removeAttr('target');
                    }
                    range.selectNode(anchor);
                };
            });
        }
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

        const mediaParams = Object.assign({}, this.options.mediaModalParams, params);
        const mediaDialog = new weWidgets.MediaDialog(this, mediaParams, $(params.node).clone());
        mediaDialog.open();

        mediaDialog.on('save', this, function(element) {
            // restore saved html classes
            if (params.htmlClass) {
                element.className += " " + params.htmlClass;
            }
            restoreSelection();
            this.odooEditor.execCommand('insertHTML', element.outerHTML);
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

    _configureToolbar: function () {
        const $toolbar = this.toolbar.$el;
        const openTools = e => {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            switch (e.target.id) {
                case 'create-link':
                    this.toggleLinkTools();
                    break;
                case 'media-modal':
                    this.openMediaDialog();
                    break;
                case 'media-description':
                    this.toggleAltTools();
                    break;
            }
        };
        $toolbar.find('#create-link, #media-modal, #media-description').click(openTools);
        $toolbar.find('#image-shape div').click(e => {
            if (!this.lastImageClicked) return;
            this.lastImageClicked.classList.toggle(e.target.id);
            e.target.classList.toggle('active', $(this.lastImageClicked).hasClass(e.target.id));
        });
        const $imageWidthButtons = $toolbar.find('#image-width div');
        $imageWidthButtons.click(e => {
            if (!this.lastImageClicked) return;
            this.lastImageClicked.style.width = e.target.id;
            for (const button of $imageWidthButtons) {
                button.classList.toggle('active', this.lastImageClicked.style.width === button.id);
            }
        });
        $toolbar.find('#image-padding .dropdown-item').click(e => {
            if (!this.lastImageClicked) return;
            $(this.lastImageClicked).removeClass((index, className) => (
                (className.match(/(^|\s)padding-\w+/g) || []).join(' ')
            )).addClass(e.target.dataset.class);
        });
        $toolbar.find('#justify div.btn').on('mousedown', e => {
            if (!this.lastImageClicked) return;
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
            this.lastImageClicked.classList.remove('float-left', 'float-right');
            if (this.lastImageClicked.classList.contains('mx-auto')) {
                this.lastImageClicked.classList.remove('d-block', 'mx-auto');
            }
            const mode = e.target.parentElement.id.replace('justify', '').toLowerCase();
            const classes = mode === 'center' ? ['d-block', 'mx-auto'] : ['float-' + mode];
            this.lastImageClicked.classList.add(...classes);
            this._updateImageJustifyButton(e.target.parentElement.id);
        });
        $toolbar.find('#image-crop').click(e => {
            if (!this.lastImageClicked) return;
            new weWidgets.ImageCropWidget(this, this.lastImageClicked).appendTo(this.$editable);
        });
        $toolbar.find('#image-transform').click(e => {
            if (!this.lastImageClicked) return;
            const $image = $(this.lastImageClicked);
            if ($image.data('transfo-destroy')) {
                $image.removeData('transfo-destroy');
                return;
            }
            $image.transfo();
            const mouseup = () => {
                $('.note-popover button[data-event="transform"]').toggleClass('active', $image.is('[style*="transform"]'));
            };
            $(this.odooEditor.document).on('mouseup', mouseup);
            const mousedown = mousedownEvent => {
                if (!$(mousedownEvent.target).closest('.transfo-container').length) {
                    $image.transfo('destroy');
                    $(this.odooEditor.document).off('mousedown', mousedown).off('mouseup', mouseup);
                }
                if ($(mousedownEvent.target).closest('.note-popover').length) {
                    $image.data('transfo-destroy', true).attr('style', ($image.attr('style') || '').replace(/[^;]*transform[\w:]*;?/g, ''));
                }
                $image.trigger('content_changed');
            };
            $(this.odooEditor.document).on('mousedown', mousedown);
        });
        $toolbar.find('#image-delete').click(e => {
            if (!this.lastImageClicked) return;
            $(this.lastImageClicked).remove();
            this.lastImageClicked = undefined;
        });
        const $colorpickerGroup = $toolbar.find('#colorInputButtonGroup');
        if ($colorpickerGroup.length) {
            this._createPalette();
        }
    },
    /**
     * Restore the content editable property on the main editor element
     *
     * when leaving the focus of a `<a>` tag,
     * we need to remove the contenteditable property on the links
     * and restore it on the #wrap element of the editor
     *
     * @param {Node} clickTarget
     */
    _restoreMainContentEditable(clickTarget) {
        if(this.$currentLinkEdition !== undefined && this.$currentLinkEdition[0] !== clickTarget) {
            this.odooEditor.automaticStepUnactive("linkEditionFix");
            this.$editableWrap.attr('contenteditable', 'true');
            this.$currentLinkEdition.removeAttr('contenteditable');
            this.$currentLinkEdition = undefined;
            this.odooEditor.automaticStepActive("linkEditionFix");
        }
    },
    _createPalette() {
        const $dropdownContent = this.toolbar.$el.find('#colorInputButtonGroup .colorPalette');
        // The editor's root widget can be website or web's root widget and cannot be properly retrieved...
        const parent = odoo.__DEBUG__.services['root.widget'];
        for (const elem of $dropdownContent) {
            const eventName = elem.dataset.eventName;
            let colorpicker = null;
            const mutex = new concurrency.MutexedDropPrevious();
            const $dropdown = $(elem).closest('.colorpicker-group , .dropdown');
            let manualOpening = false;
            // Prevent dropdown closing on colorpicker click
            $dropdown.on('hide.bs.dropdown', ev => {
                return !(ev.clickEvent && ev.clickEvent.originalEvent && ev.clickEvent.originalEvent.__isColorpickerClick);
            });
            $dropdown.on('show.bs.dropdown', () => {
                if (manualOpening) {
                    return true;
                }
                mutex.exec(() => {
                    const oldColorpicker = colorpicker;
                    const hookEl = oldColorpicker ? oldColorpicker.el : elem;

                    const selection = this.odooEditor.document.getSelection();
                    const range = selection.rangeCount && selection.getRangeAt(0);
                    const targetNode = range && range.startContainer;
                    const targetElement = targetNode && targetNode.nodeType === Node.ELEMENT_NODE
                        ? targetNode
                        : targetNode && targetNode.parentNode;
                    colorpicker = new ColorPaletteWidget(parent, {
                        excluded: ['transparent_grayscale'],
                        $editable: $(this.odooEditor.dom), // Our parent is the root widget, we can't retrieve the editable section from it...
                        selectedColor: $(targetElement).css(eventName === "foreColor" ? 'color' : 'backgroundColor'),
                    });
                    colorpicker.on('custom_color_picked color_picked', null, ev => {
                        this._processAndApplyColor(eventName, ev.data.color);
                        this.odooEditor.historyStep();
                    });
                    colorpicker.on('color_hover color_leave', null, ev => {
                        this._processAndApplyColor(eventName, ev.data.color);
                    });
                    colorpicker.on('enter_key_color_colorpicker', null, () => {
                        $dropdown.children('.dropdown-toggle').dropdown('hide');
                    });
                    return colorpicker.replace(hookEl).then(() => {
                        if (oldColorpicker) {
                            oldColorpicker.destroy();
                        }
                        manualOpening = true;
                        $dropdown.children('.dropdown-toggle').dropdown('show');
                        manualOpening = false;
                    });
                });
                return false;
            });
        };
    },
    _processAndApplyColor: function (eventName, color) {
        if (!color) {
            color = 'inherit';
        } else if (!ColorpickerWidget.isCSSColor(color)) {
            color = (eventName === "foreColor" ? 'text-' : 'bg-') + color;
        }
        this.odooEditor.applyColor(color, eventName === 'foreColor' ? 'color' : 'backgroundColor');
        const hexColor = this._colorToHex(color);
        this.odooEditor.updateColorpickerLabels({
            [eventName === 'foreColor' ? 'foreColor' : 'hiliteColor']: hexColor,
        });
    },
    _colorToHex: function (color) {
        if (color.startsWith('#')) {
            return color;
        } else {
            let rgbColor;
            if (color.startsWith('rgb')) {
                rgbColor = color;
            } else {
                const $font = $(`<font class="${color}"/>`)
                $(document.body).append($font);
                const propertyName = color.startsWith('text') ? 'color' : 'backgroundColor';
                rgbColor = $font.css(propertyName);
                $font.remove();
            }
            return rgbToHex(rgbColor);
        }
    },
    /**
     * Update any editor UI that is not handled by the editor itself.
     */
    _updateEditorUI: function (e) {
        // Remove the alt tools.
        this.altTools && this.altTools.destroy();
        this.altTools = undefined;
        // Remove the link tools.
        this.linkTools && this.linkTools.destroy();
        this.linkTools = undefined;
        // Hide the create-link button if the selection spans several blocks.
        const selection = this.odooEditor.document.getSelection();
        const range = selection.rangeCount && selection.getRangeAt(0);
        const $rangeContainer = range && $(range.commonAncestorContainer);
        const spansBlocks = range && !!$rangeContainer.contents().filter((i, node) => isBlock(node)).length
        this.toolbar.$el.find('#create-link').toggleClass('d-none', !range || spansBlocks);
        // Only show the image tools in the toolbar if the current selected
        // snippet is an image.
        const isInImage = $(e.target).is('img');
        this.toolbar.$el.find([
            '#media-description',
            '#image-shape',
            '#image-width',
            '#image-padding',
            '#image-edit',
        ].join(',')).toggleClass('d-none', !isInImage);
        this.lastImageClicked = isInImage && e.target;
        // Hide the irrelevant text buttons.
        this.toolbar.$el.find([
            '#style',
            '#decoration',
            '#font-size',
            '#justifyFull',
            '#list',
            '#colorInputButtonGroup',
            '#table',
            '#create-link',
        ].join(',')).toggleClass('d-none', isInImage);
        // Toggle the toolbar arrow.
        this.toolbar.$el.toggleClass('noarrow', isInImage);
        if (isInImage) {
            // Select the image in the DOM.
            const selection = this.odooEditor.document.getSelection();
            const range = this.odooEditor.document.createRange();
            range.selectNode(this.lastImageClicked);
            selection.removeAllRanges();
            selection.addRange(range);
            // Always hide the unlink button on images
            this.toolbar.$el.find('#unlink').toggleClass('d-none', true);
            // Show the floatingtoolbar on the topleft of the image.
            if (this.options.autohideToolbar) {
                const imagePosition = this.lastImageClicked.getBoundingClientRect();
                this.toolbar.$el.css({
                    visibility: 'visible',
                    top: imagePosition.top + 10 + 'px',
                    left: imagePosition.left + 10 + 'px',
                });
            }
            // Toggle the 'active' class on the active image tool buttons.
            for (const button of $('#image-shape div')) {
                button.classList.toggle('active', $(e.target).hasClass(button.id));
            }
            for (const button of $('#image-width div')) {
                button.classList.toggle('active', e.target.style.width === button.id);
            }
            this._updateImageJustifyButton();
        }
    },
    _updateImageJustifyButton: function (commandState) {
        if (!this.lastImageClicked) return;
        const $paragraphDropdownButton = this.toolbar.$el.find('#paragraphDropdownButton');
        if (!commandState) {
            const justifyMapping = [
                ['float-left', 'justifyLeft'],
                ['mx-auto', 'justifyCenter'],
                ['float-right', 'justifyRight'],
            ];
            commandState = (justifyMapping.find(pair => (
                this.lastImageClicked.classList.contains(pair[0]))
            ) || [])[1];
        }
        const $buttons = this.toolbar.$el.find('#justify div.btn');
        for (const button of $buttons) {
            button.classList.toggle('active', button.id === commandState);
        }
        if (commandState) {
            const direction = commandState.replace('justify', '').toLowerCase();
            const newClass = `fa-align-${direction === 'full' ? 'justify' : direction}`;
            $paragraphDropdownButton.removeClass((index, className) => (
                (className.match(/(^|\s)fa-align-\w+/g) || []).join(' ')
            )).addClass(newClass);
        }
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

        const $allBlocks = $((this.options || {}).savableSelector).filter('.o_dirty');

        const $dirty = $('.o_dirty');
        $dirty
            .removeAttr('contentEditable')
            .removeClass('o_dirty oe_carlos_danger o_is_inline_editable');

        $('.o_editable')
            .removeClass('o_editable o_is_inline_editable o_editable_date_field_linked o_editable_date_field_format_changed');

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
    _onDocumentMousedown: function (e) {
        this._restoreMainContentEditable(e.target);
        if (e.target.closest('.oe-toolbar')) {
            this._onToolbar = true;
        } else {
            if (this._pendingBlur && !e.target.closest('.o_wysiwyg_wrapper')) {
                this.trigger_up('wysiwyg_blur');
                this._pendingBlur = false;
            }
            this._onToolbar = false;
        }
    },
    _onBlur: function () {
        if (this._onToolbar) {
            this._pendingBlur = true;
        } else {
            this.trigger_up('wysiwyg_blur');
        }
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
