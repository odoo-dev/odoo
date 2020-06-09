odoo.define('web_editor.wysiwyg', function (require) {
'use strict';
var Widget = require('web.Widget');
var JWEditorLib = require('web_editor.jabberwock');
var SnippetsMenu = require('web_editor.snippet.editor').SnippetsMenu;
var weWidgets = require('wysiwyg.widgets');

var summernoteCustomColors = require('web_editor.rte.summernote_custom_colors');
// Used to track the wysiwyg that will contain an iframe
var id = 0;

var Wysiwyg = Widget.extend({
    defaultOptions: {
        legacy: true,
        'focus': false,
        'lang': 'odoo',
        recordInfo: {
            context: {},
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
        // end legacy editor

        this.$target = this.$el;
        return this._super();
    },
    /**
     *
     * @override
     */
    start: async function () {
        if (this.options.legacy) {
            this.editorCommands = this.legacyEditorCommands;
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
            const _super = this._super;
            const elementToParse = document.createElement('div');
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
                    this._getEdiable($wrapwrap).addClass('o_editable');

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


                    if (this.snippetsMenu) {
                        this.snippetsMenu.$editor = $('#wrapwrap');
                        await this.snippetsMenu.afterRender();
                    }
                },
                snippetMenuElement: $mainSidebar[0],
                snippetManipulators: $snippetManipulators[0],
                customCommands: {
                    openMedia: {handler: this.openMediaDialog.bind(this)},
                    openLinkDialog: {handler: this.openLinkDialog.bind(this)},
                    saveOdoo: {handler: this.saveToServer.bind(this)}
                },
                source: elementToParse,
                location: this.options.location,
                saveButton: this.options.saveButton,
                template: this.options.template,
            });

            this.editor.load(JWEditorLib.DevTools);
            await this.editor.start();
            this.editor.enableRender = false;

            const layout = this.editor.plugins.get(JWEditorLib.Layout);
            const domLayout = layout.engines.dom;
            this.domLayout = domLayout;

            const editableNVnode = domLayout.components.get('editable')[0];
            this.editorEditable = domLayout.getDomNodes(editableNVnode)[0];

            // init editor commands helpers for Odoo
            this.editorCommands = JWEditorLib.getOdooCommands(this.editor);

            // todo: handle megamenu

            if (this.options.snippets) {
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
            const linkInfo = await this.editor.execCommand('getLinkInfo');
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
                            const nodes = params.context.range.targetedNodes(this.editor.InlineNode);
                            const links = nodes.map(node => node.modifiers.find(this.editor.LinkFormat)).filter(f => f);
                            for (const link of links) {
                                link.modifiers.get(this.editor.Attributes).set('class', params.classes);
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
            mediaDialog.on('save', this, async (element)=> {
                await this.editor.execCommand('insertHtml', {
                    html: element.outerHTML
                });
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
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    async execBatch(...args) {
        await this.editor.execBatch(...args);
    },

    // todo: handle when the server error (previously carlos_danger)
    saveToServer: async function (reload = true) {
        const defs = [];
        const promises = [];
        // this trigger will be catched by the "navbar" (i.e. the manager of
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
            promises.push(this.snippetsMenu.cleanForSave());
        }

        promises.push(this._saveAllViewsBlocks());
        // todo: make them work
        // promises.push(this._saveCoverPropertiesBlocks());
        // promises.push(this._saveMegaMenuBlocks());
        // promises.push(this._saveNewsletterBlocks());
        // promises.push(this._saveTranslationBlocks());
        // promises.push(this.saveCroppedImages());

        await Promise.all(promises);
        this.trigger_up('edition_was_stopped');
        if (reload) {
            location.reload();
        }
    },

    _saveAllViewsBlocks: async function (views) {
        const structureNodes = await this.editor.execCommand('getStructures');
        const promises = [];
        for (const structureNode of structureNodes) {
            const renderer = this.editor.plugins.get(JWEditorLib.Renderer);
            const renderedNode = (await renderer.render('dom/html', structureNode))[0];

            promises.push(this._rpc({
                model: 'ir.ui.view',
                method: 'save',
                args: [
                    parseInt(structureNode.viewId),
                    renderedNode.outerHTML,
                    structureNode.xpath,
                ],
                context: this.options.recordInfo.context,
            }));
        }

        return Promise.all(promises);
    },

    _saveCoverPropertiesBlocks: async function (editable) {
        var el = this.editor.execCommand('getRecordCover');
        if (!el) {
            console.warn('no getRecordCover found');
            return;
        }

        var resModel = el.dataset.resModel;
        var resID = parseInt(el.dataset.resId);
        if (!resModel || !resID) {
            throw new Error('There should be a model and id associated to the cover');
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

        return this._rpc({
            model: resModel,
            method: 'write',
            args: [
                resID,
                {'cover_properties': JSON.stringify(coverProps)}
            ],
        });
    },
    _saveMegaMenuBlocks: async function (outerHTML, recordInfo, editable) {
        // Saving mega menu options
        if ($el.data('oe-field') === 'mega_menu_content') {
            // On top of saving the mega menu content like any other field
            // content, we must save the custom classes that were set on the
            // menu itself.
            // FIXME normally removing the 'show' class should not be necessary here
            // TODO check that editor classes are removed here as well
            var classes = _.without($el.attr('class').split(' '), 'dropdown-menu', 'o_mega_menu', 'show');
            promises.push(this._rpc({
                model: 'website.menu',
                method: 'write',
                args: [
                    [parseInt($el.data('oe-id'))],
                    {
                        'mega_menu_classes': classes.join(' '),
                    },
                ],
            }));
        }
    },
    _saveNewsletterBlocks: async function (outerHTML, recordInfo, editable) {
        var self = this;
        var defs = [this._super.apply(this, arguments)];
        var $popups = $(editable).find('.o_newsletter_popup');
        _.each($popups, function (popup) {
            var $popup = $(popup);
            var content = $popup.data('content');
            if (content) {
                defs.push(self._rpc({
                    route: '/website_mass_mailing/set_content',
                    params: {
                        'newsletter_id': parseInt($popup.attr('data-list-id')),
                        'content': content,
                    },
                }));
            }
        });
        return Promise.all(defs);
    },
    _saveTranslationBlocks: async function ($el, context, withLang) {
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
    saveCroppedImages: function ($editable) {
        var defs = _.map($editable.find('.o_cropped_img_to_save'), async croppedImg => {
            var $croppedImg = $(croppedImg);
            $croppedImg.removeClass('o_cropped_img_to_save');

            var resModel = $croppedImg.data('crop:resModel');
            var resID = $croppedImg.data('crop:resID');
            var cropID = $croppedImg.data('crop:id');
            var mimetype = $croppedImg.data('crop:mimetype');
            var originalSrc = $croppedImg.data('crop:originalSrc');

            var datas = $croppedImg.attr('src').split(',')[1];
            let attachmentID = cropID;
            if (!cropID) {
                var name = originalSrc + '.crop';
                attachmentID = await this._rpc({
                    model: 'ir.attachment',
                    method: 'create',
                    args: [{
                        res_model: resModel,
                        res_id: resID,
                        name: name,
                        datas: datas,
                        mimetype: mimetype,
                        url: originalSrc, // To save the original image that was cropped
                    }],
                });
            } else {
                await this._rpc({
                    model: 'ir.attachment',
                    method: 'write',
                    args: [[cropID], {datas: datas}],
                });
            }
            const accessToken = await this._rpc({
                model: 'ir.attachment',
                method: 'generate_access_token',
                args: [[attachmentID]],
            });
            $croppedImg.attr('src', '/web/image/' + attachmentID + '?access_token=' + accessToken[0]);
        });
        return Promise.all(defs);
    },

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

    _getEdiable($element) {
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

    // legacy editor commands
    editorCommands: {
        toggleClass(remove) {
            $(element).remove();
        },
        hasVNode() {
            return false;
        },
        toggleClass(element) {
            $(element).toggleClass('o_disabled', !isEnabled);
        },
        insertHtml(point, content) {
            $(point[0]).after(content);
        }
    }
});

return Wysiwyg;
});
