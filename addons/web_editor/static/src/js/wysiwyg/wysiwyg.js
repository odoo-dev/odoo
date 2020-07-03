odoo.define('web_editor.wysiwyg', function (require) {
'use strict';
var Dialog = require('web.Dialog');
var config = require('web.config');
var Widget = require('web.Widget');
var JWEditorLib = require('web_editor.jabberwock');
var SnippetsMenu = require('web_editor.snippet.editor').SnippetsMenu;
var weWidgets = require('wysiwyg.widgets');

var core = require('web.core');
var _t = core._t;

var summernoteCustomColors = require('web_editor.rte.summernote_custom_colors');
// Used to track the wysiwyg that will contain an iframe
var id = 0;

var Wysiwyg = Widget.extend({
    defaultOptions: {
        'legacy': true,
        'focus': false,
        'lang': 'odoo',
        'recordInfo': {
            'context': {},
        },
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
        'colors': summernoteCustomColors,
    },

    /**
     * @options {Object} options
     * @options {Object} options.recordInfo
     * @options {Object} options.recordInfo.context
     * @options {String} [options.recordInfo.context]
     * @options {integer} [options.recordInfo.res_id]
     * @options {String} [options.recordInfo.data_res_model]
     * @options {integer} [options.recordInfo.data_res_id]
     *   @see _onGetRecordInfo
     *   @see _getAttachmentsDomain in /wysiwyg/widgets/media.js
     * @options {Object} options.attachments
     *   @see _onGetRecordInfo
     *   @see _getAttachmentsDomain in /wysiwyg/widgets/media.js (for attachmentIDs)
     * @options {function} options.generateOptions
     *   called with the summernote configuration object used before sending to summernote
     *   @see _editorOptions
     **/
    init: function (parent, options) {
        this._super.apply(this, arguments);
        this.id = ++id;
        this.value = options.value || '';
        this.options = options;
    },
    /**
     * Load assets and color picker template then call summernote API
     * and replace $el by the summernote editable node.
     *
     * @override
     **/
    willStart: async function () {
        if (this.options.legacy) {
            const SummernoteManager = odoo.__DEBUG__.services['web_editor.rte.summernote'];
            this._summernoteManager = new SummernoteManager(this);
        }
        this.$target = this.$el;
        return this._super();
    },
    /**
     *
     * @override
     */
    start: async function () {
        if (this.options.legacy) {
            this.$target.wrap('<odoo-wysiwyg-container>');
            this.$el = this.$target.parent();
            var options = this._editorOptions();
            this.$target.summernote(options);
            this.$editor = this.$('.note-editable:first');
            this.$editor.data('wysiwyg', this);
            this.$editor.data('oe-model', options.recordInfo.res_model);
            this.$editor.data('oe-id', options.recordInfo.res_id);
            $(document).on('mousedown', this._blur);
            this._value = this.$target.html() || this.$target.val();
            return this._super.apply(this, arguments);
        } else {
            const self = this;
            const _super = this._super;
            const elementToParse = document.createElement('div');
            elementToParse.setAttribute('class', 'd-flex d-column o_editor_center');
            elementToParse.innerHTML = this.value;

            if (this.options.enableWebsite) {
                $(document.body).addClass('o_connected_user editor_enable editor_has_snippets');
            }
            const $mainSidebar = $('<div class="o_main_sidebar">');
            const $snippetManipulators = $('<div id="oe_manipulators" />');

            this.editor = new JWEditorLib.OdooWebsiteEditor({
                afterRender: async ()=> {
                    const $wrapwrap = $('#wrapwrap');
                    $wrapwrap.removeClass('o_editable'); // clean the dom before edition
                    this._getEditable($wrapwrap).addClass('o_editable');

                    // todo: change this quick fix
                    const $firstDiv = $('.wrapwrap main>div');
                    if ($firstDiv.length) {
                        $firstDiv.find('.oe_structure').addClass('o_editable');
                        $firstDiv.addClass('oe_structure o_editable note-air-editor note-editable');

                        this.$editorMessageElements = $firstDiv
                            // todo: translate message
                            .attr('data-editor-message', 'DRAG BUILDING BLOCKS HERE');
                    }

                    // To see the dashed lines on empty editor, the first element must be empty.
                    // As the jabberwock editor currently add <p><br/></p> when the editor is empty,
                    // we need to remove it.
                    if ($firstDiv.html() === '<br>') {
                        $firstDiv.empty();
                    }
                },
                snippetMenuElement: $mainSidebar[0],
                snippetManipulators: $snippetManipulators[0],
                customCommands: {
                    openMedia: {handler: this.openMediaDialog.bind(this)},
                    openLinkDialog: {handler: this.openLinkDialog.bind(this)},
                    discardOdoo: {handler: this.discardEditions.bind(this)},
                    saveOdoo: {handler: this.saveToServer.bind(this)}
                },
                source: elementToParse,
                location: this.options.location,
                saveButton: this.options.saveButton,
                discardButton: this.options.discardButton,
                template: this.options.template,
            });
            if(config.isDebug()) { //debug mode
                this.editor.load(JWEditorLib.DevTools);
            }
            await this.editor.start();
            this._bindAfterStart();

            const layout = this.editor.plugins.get(JWEditorLib.Layout);
            const domLayout = layout.engines.dom;
            this.domLayout = domLayout;

            const editableNVnode = domLayout.components.get('editable')[0];
            this.editorEditable = domLayout.getDomNodes(editableNVnode)[0];

            this.editorHelpers = this.editor.plugins.get(JWEditorLib.DomHelpers);

            // add class when page content is empty to show the "DRAG BUILDING BLOCKS HERE" block
            const emptyClass = "oe_blank_wrap";
            const targetNode = this.editorEditable.querySelector("#wrap");
            if(targetNode) {
                let mutationCallback = function () {
                    if (targetNode.textContent.trim() === '') {
                        targetNode.setAttribute('data-editor-message', _t('DRAG BUILDING BLOCKS HERE'));
                        targetNode.classList.add(emptyClass);
                    } else {
                        targetNode.classList.remove(emptyClass);
                    }
                };
                const observer = new MutationObserver(mutationCallback);
                observer.observe(targetNode, {childList: true});
                // force check at editor startup
                mutationCallback();
            }

            // todo: handle megamenu

            if (this.options.snippets) {
                this.editor.enableRender = false;
                this.$webEditorToolbar = $('<div id="web_editor-toolbars">');

                var $toolbarHandler = $('#web_editor-top-edit');
                $toolbarHandler.append(this.$webEditorToolbar);

                this.snippetsMenu = new SnippetsMenu(this, Object.assign({
                    $el: $(this.editorEditable),
                    selectorEditableArea: '.o_editable',
                    $snippetEditorArea: $snippetManipulators,
                    wysiwyg: this,
                    JWEditorLib: JWEditorLib,
                }, this.options));
                await this.snippetsMenu.appendTo($mainSidebar);
                this.editor.enableRender = true;
                this.editor.render();
                this.snippetsMenu.$editor = $('#wrapwrap');

                this.$el.on('content_changed', function (e) {
                    self.trigger_up('wysiwyg_change');
                });
            } else {
                return _super.apply(this, arguments);
            }
        }
    },

    openLinkDialog() {
        return new Promise(async (resolve) => {
            let linkInfo;
            await this.editor.execCustomCommand(async () => {
                const range = this.editor.selection.range;
                const targettedLeaves = range.targetedNodes(node => !node.hasChildren());
                const text = targettedLeaves.map(x => x.textContent).join('');
                const inline = this.editor.plugins.get(JWEditorLib.Inline);
                const modifiers = inline.getCurrentModifiers(range);
                const linkFormat = modifiers.find(JWEditorLib.LinkFormat);
                const attributes = modifiers.find(JWEditorLib.Attributes);
                const linkFormatAttributes = linkFormat && linkFormat.modifiers.find(JWEditorLib.Attributes);
                linkInfo = {
                    text: text,
                    url: linkFormat && linkFormat.url || '',
                    class: attributes && attributes.get('class') || '',
                    target: linkFormatAttributes && linkFormatAttributes.get('target'),
                };
            });
            var linkDialog = new weWidgets.LinkDialog(this,
                {
                    props: {
                        text: linkInfo.text,
                        url: linkInfo.url,
                        class: linkInfo.class,
                        target: linkInfo.target,
                    }
                },
            );
            linkDialog.open();
            linkDialog.on('save', this, async (params)=> {
                    await this.editor.execBatch(async () =>{
                        const linkParams = {
                            url: params.url,
                            label: params.text,
                            target: params.isNewWindow ? '_blank' : '',
                        };
                        await this.editor.execCommand('link', linkParams);
                        await this.editor.execCustomCommand(async () => {
                            const nodes = this.editor.selection.range.targetedNodes(JWEditorLib.InlineNode);
                            const links = nodes.map(node => node.modifiers.find(JWEditorLib.LinkFormat)).filter(f => f);
                            for (const link of links) {
                                link.modifiers.get(JWEditorLib.Attributes).set('class', params.classes);
                            }
                        });
                    });
                resolve();
            });
            linkDialog.on('cancel', this, resolve);
        });
    },
    openMediaDialog() {
        return new Promise((resolve)=>{
            var mediaDialog = new weWidgets.MediaDialog(this,
                {},
            );
            mediaDialog.open();
            mediaDialog.on('save', this, async (element) => {
                await this.editorHelpers.insertHtml(element.outerHTML);
                resolve();
            });
            mediaDialog.on('cancel', this, resolve);
        });
    },

    /**
     * @override
     */
    destroy: function () {
        this.editor.stop();
        this._super();
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
        return this.$editor;
    },
    /**
     * Return true if the content has changed.
     *
     * @returns {Boolean}
     */
    isDirty: async function () {
        // todo: use jweditor memory to know if it's dirty.
        return true;
    },
    /**
     * Set the focus on the element.
     */
    focus: function () {
        // todo: handle tab that need to go to next field if the editor does not
        //       catch it.
        this.$el.find('[contenteditable="true"]').focus();
    },
    /**
     * Get the value of the editable element.
     *
     * @param {object} [options]
     * @param {jQueryElement} [options.$layout]
     * @returns {String}
     */
    getValue: async function () {
        return this.editor.getValue();
    },
    /**
     * @param {String} value
     * @param {Object} options
     * @param {Boolean} [options.notifyChange]
     * @returns {String}
     */
    setValue: function (value, options) {
        this._value = value;
    },
    // todo: handle when the server error (previously carlos_danger)
    saveToServer: async function (reload = true) {
        const defs = [];
        // This trigger will be catched by the "navbar" (i.e. the manager of
        // widgets). It will trigger an action on all thoses widget called
        // "on_save" so that they can do something before the saving occurs.
        //
        // Theses evens (ready_to_save and on_save) could be called respectively
        // "before_wysiwig_save" and "before_navbar_wysiwyg_save".
        //
        // "content.js" and "edit.js" that receive that event.
        this.trigger_up('edition_will_stopped');
        this.trigger_up('ready_to_save', {defs: defs});
        await Promise.all(defs);

        if (this.snippetsMenu) {
            await this.snippetsMenu.cleanForSave();
        }

        await this._saveModifiedImages();
        // todo: avoid redraw the editor if executing execCommand
        await this.editor.execBatch(async ()=> {
            // todo: make them work
            await this._saveViewBlocks();
            await this._saveCoverPropertiesBlocks();
            await this._saveMegaMenuClasses();
        });

        this.trigger_up('edition_was_stopped');
        if (reload) {
            window.location.reload();
        }
    },
    discardEditions: async function () {
        var self = this;
        return new Promise(function (resolve, reject) {
            var confirm = Dialog.confirm(this, _t("If you discard the current edits, all unsaved changes will be lost. You can cancel to return to edit mode."), {
                confirm_callback: resolve,
            });
            confirm.on('closed', self, reject);
        }).then(function () {
            window.onbeforeunload = null;
            window.location.reload();
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Save all "view" blocks.
     *
     * @private
     */
    _saveViewBlocks: async function () {
        const promises = [];
        const layout = this.editor.plugins.get(JWEditorLib.Layout);
        const domLayout = layout.engines.dom;
        const editable = domLayout.components.get('editable')[0];
        const nodes = editable.descendants((node) => node instanceof JWEditorLib.OdooStructureNode || node instanceof JWEditorLib.OdooFieldNode);
        for (const node of nodes) {
            const renderer = this.editor.plugins.get(JWEditorLib.Renderer);
            const renderedNode = (await renderer.render('dom/html', node))[0];

            promises.push(this._rpc({
                model: 'ir.ui.view',
                method: 'save',
                args: [
                    parseInt(renderedNode.dataset.oeId),
                    renderedNode.outerHTML,
                    node.xpath,
                ],
                context: this.options.recordInfo.context,
            }));
        }
        return Promise.all(promises);
    },

    /**
     * Save all "cover properties" blocks.
     *
     * @private
     */
    _saveCoverPropertiesBlocks: async function () {
        let rpcResult;
        await this.editor.execCustomCommand(async () => {
            const layout = this.editor.plugins.get(JWEditorLib.Layout);
            const domLayout = layout.engines.dom;
            const editableNode = domLayout.components.get('editable')[0];
            const covers = editableNode.descendants(node => {
                const attributes = node.modifiers.find(JWEditorLib.Attributes);

                if (attributes && attributes.length && typeof attributes.get('class') === 'string') {
                    return attributes.classList.has('o_record_cover_container');
                }
            });
            const el = covers && covers[0] && domLayout.getDomNodes(covers[0])[0];
            if (!el) {
                console.warn('No cover found.');
                return;
            }

            var resModel = el.dataset.resModel;
            var resID = parseInt(el.dataset.resId);
            if (!resModel || !resID) {
                throw new Error('There should be a model and id associated to the cover.');
            }

            this.__savedCovers = this.__savedCovers || {};
            this.__savedCovers[resModel] = this.__savedCovers[resModel] || [];

            if (this.__savedCovers[resModel].includes(resID)) {
                return;
            }
            this.__savedCovers[resModel].push(resID);

            var cssBgImage = $(el.querySelector('.o_record_cover_image')).css('background-image');
            var coverProps = {
                'background-image': cssBgImage.replace(/"/g, '').replace(window.location.protocol + "//" + window.location.host, ''),
                'background_color_class': el.dataset.bgColorClass,
                'background_color_style': el.dataset.bgColorStyle,
                'opacity': el.dataset.filterValue,
                'resize_class': el.dataset.coverClass,
                'text_align_class': el.dataset.textAlignClass,
            };

            rpcResult = this._rpc({
                model: resModel,
                method: 'write',
                args: [
                    resID,
                    {'cover_properties': JSON.stringify(coverProps)}
                ],
            });
        });
        return rpcResult;
    },
    /**
     * Save all "mega menu" classes.
     *
     * @private
     */
    _saveMegaMenuClasses: async function () {
        const layout = this.editor.plugins.get(JWEditorLib.Layout);
        const domLayout = layout.engines.dom;
        const editable = domLayout.components.get('editable')[0];
        const structureNodes = editable.descendants((node) => {
            return node.modifiers.get(JWEditorLib.Attributes).get('data-oe-field') === 'mega_menu_content'
        });
        const promises = [];
        for (const node of structureNodes) {
            // On top of saving the mega menu content like any other field
            // content, we must save the custom classes that were set on the
            // menu itself.
            // FIXME: normally removing the 'show' class should not be necessary here
            // TODO: check that editor classes are removed here as well
            let promises = [];
            const items = node.modifiers.get(JWEditorLib.Attributes).classList.items();
            var classes = _.without(items, 'dropdown-menu', 'o_mega_menu', 'show');

            const itemId = node.modifiers.get(JWEditorLib.Attributes).get('data-oe-id');

            promises.push(this._rpc({
                model: 'website.menu',
                method: 'write',
                args: [
                    [parseInt(itemId)],
                    {
                        'mega_menu_classes': classes.join(' '),
                    },
                ],
            }));
        }

        await Promise.all(promises);
    },
    /**
     * Save all "newsletter" blocks.
     *
     * @private
     */
    _saveNewsletterBlocks: async function () {
        const defs = [];
        await this.editor.execCustomCommand(async () => {
            const layout = this.editor.plugins.get(JWEditorLib.Layout);
            const domLayout = layout.engines.dom;
            const editableNode = domLayout.components.get('editable')[0];
            defs.push(this._super.apply(this, arguments));
            const $popups = $(editableNode).find('.o_newsletter_popup');
            for (const popup of $popups) {
                const $popup = $(popup);
                const content = $popup.data('content');
                if (content) {
                    defs.push(this._rpc({
                        route: '/website_mass_mailing/set_content',
                        params: {
                            'newsletter_id': parseInt($popup.attr('data-list-id')),
                            'content': content,
                        },
                    }));
                }
            }
        });
        return Promise.all(defs);
    },
    /**
     * Save all "translation" blocks.
     *
     * @private
     * @param {JQuery} $el
     * @param {Object} context
     */
    _saveTranslationBlocks: async function ($el, context) {
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
        }
    },
    /**
     * Save all modified images.
     *
     * @private
     */
    _saveModifiedImages: async function () {
        await this.editor.execBatch(async () => {
            const defs = _.map(this._getEditable($('#wrapwrap')), async editableEl => {
                const {oeModel: resModel, oeId: resId} = editableEl.dataset;
                const proms = [...editableEl.querySelectorAll('.o_modified_image_to_save')].map(async el => {
                    const isBackground = !el.matches('img');
                    el.classList.remove('o_modified_image_to_save');

                    await this.editorHelpers.removeClass(el, 'o_modified_image_to_save');
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
                        await this.editorHelpers.setStyle(el, 'background-image', `url('${newAttachmentSrc}')`);
                        await this.editorHelpers.setAttribute(el, 'data-bgSrc', '');
                    } else {
                        await this.editorHelpers.setAttribute(el, 'src', newAttachmentSrc);
                    }
                });
                return Promise.all(proms);
            });
            await Promise.all(defs);
        });
    },
    /**
     * Called when a demand to open a alt dialog is received on the bus.
     *
     * @private
     * @param {Object} data
     */
    _onAltDialogDemand: function (data) {
        if (data.__alreadyDone) {
            return;
        }
        data.__alreadyDone = true;
        var altDialog = new weWidgets.AltDialog(this,
            data.options || {},
            data.media
        );
        if (data.onSave) {
            altDialog.on('save', this, data.onSave);
        }
        if (data.onCancel) {
            altDialog.on('cancel', this, data.onCancel);
        }
        altDialog.open();
    },
    /**
     * Called when a demand to open a "crop image" dialog is received on the
     * bus.
     *
     * @private
     * @param {Object} data
     */
    _onCropImageDialogDemand: function (data) {
        if (data.__alreadyDone) {
            return;
        }
        data.__alreadyDone = true;
        var cropImageDialog = new weWidgets.CropImageDialog(this,
            _.extend({
                res_model: data.$editable.data('oe-model'),
                res_id: data.$editable.data('oe-id'),
            }, data.options || {}),
            data.media
        );
        if (data.onSave) {
            cropImageDialog.on('save', this, data.onSave);
        }
        if (data.onCancel) {
            cropImageDialog.on('cancel', this, data.onCancel);
        }
        cropImageDialog.open();
    },
    /**
     * Called when a demand to open a link dialog is received on the bus.
     *
     * @private
     * @param {Object} data
     */
    _onLinkDialogDemand: function (data) {
        if (data.__alreadyDone) {
            return;
        }
        data.__alreadyDone = true;
        var linkDialog = new weWidgets.LinkDialog(this,
            data.options || {},
            data.$editable,
            data.linkInfo
        );
        if (data.onSave) {
            linkDialog.on('save', this, data.onSave);
        }
        if (data.onCancel) {
            linkDialog.on('cancel', this, data.onCancel);
        }
        linkDialog.open();
    },
    /**
     * Called when a demand to open a media dialog is received on the bus.
     *
     * @private
     * @param {Object} data
     */
    _onMediaDialogDemand: function (data) {
        if (data.__alreadyDone) {
            return;
        }
        data.__alreadyDone = true;

        var mediaDialog = new weWidgets.MediaDialog(this,
            _.extend({
                res_model: data.$editable.data('oe-model'),
                res_id: data.$editable.data('oe-id'),
                domain: data.$editable.data('oe-media-domain'),
            }, data.options),
            data.media
        );
        if (data.onSave) {
            mediaDialog.on('save', this, data.onSave);
        }
        if (data.onCancel) {
            mediaDialog.on('cancel', this, data.onCancel);
        }
        mediaDialog.open();
    },
    /**
     * Returns the editable areas on the page.
     *
     * @param {JQuery} $element
     * @returns {JQuery}
     */
    _getEditable($element) {
        return $element.find('[data-oe-model]')
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
    /**
     * Additional binding after start.
     *
     * Meant to be overridden
     */
    _bindAfterStart() {},
});

$.fn.extend({
    selectContent: function () {
        if (this.length) {
            let node = this[0];
            const range = new Range();
            range.setStartBefore(node);
            range.setEndAfter(node);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
        return this;
    },
});

return Wysiwyg;
});
