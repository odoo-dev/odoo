/** @odoo-module **/

import { qweb as QWeb } from 'web.core';
import { DocumentWidget } from 'wysiwyg.widgets.media';
import MediaDialog from 'wysiwyg.widgets.MediaDialog';
import Wysiwyg from 'web_editor.wysiwyg';
import { KnowledgeArticleLinkModal } from 'knowledge.wysiwyg.article_link';
import { preserveCursor, setCursorStart } from '@web_editor/../lib/odoo-editor/src/OdooEditor';

const CustomDocumentWidget = DocumentWidget.extend({
    /**
     * @override
     */
    init: function (parent, media, options) {
        options = _.extend({
            accept: '*/*',
            mimetypeDomain: [['mimetype', '!=', false]],
        }, options || {});
        this._super(parent, media, options);
    },
    /**
     * Custom rendering for the /file command
     *
     * @override
     * @param {Object} img
     * @returns {Element}
     */
    _renderMedia: function (img) {
        if (img.image_src) {
            delete img.image_src;
        }
        const file = this._super(...arguments);
        const extension = (img.name && img.name.split('.').pop()) || img.mimetype;
        this.$media = $(QWeb.render('knowledge.file_block', {
            img: {
                name: img.name,
                extension: extension,
            },
        }));
        this.media = this.$media[0];
        this.media.querySelector('.o_knowledge_file_image').innerHTML = file.outerHTML;
        return this.media;
    }
});

const CustomMediaDialog = MediaDialog.extend({
    /**
     * @override
     * @param {Object} media
     * @param {Object} options
     * @returns {Widget}
     */
    getDocumentWidget: function (media, options) {
        return new CustomDocumentWidget(this, media, options);
    }
});

Wysiwyg.include({
    /**
     * @override
     */
    init: function (parent, options) {
        if (options.knowledge_commands) {
            /**
             * knowledge_commands is a view option from a field_html that
             * indicates that knowledge-specific commands should be loaded.
             * powerboxFilters is an array of functions used to filter commands
             * displayed in the powerbox.
             */
            options.powerboxFilters = options.powerboxFilters ? options.powerboxFilters : [];
            options.powerboxFilters.push(this._filterKnowledgeCommandGroupInTemplate);
        }
        this._super.apply(this, arguments);
    },
    /**
     * Prevent usage of commands from the group "Knowledge" inside the block
     * inserted by the /template Knowledge command. The content of a /template
     * block is destined to be used in @see OdooEditor in modules other than
     * Knowledge, where knowledge-specific commands may not be available.
     * i.e.: prevent usage /template in a /template block
     *
     * @param {Array} commands commands available in this wysiwyg
     * @returns {Array} commands which can be used after the filter was applied
     */
    _filterKnowledgeCommandGroupInTemplate: function (commands) {
        let anchor = document.getSelection().anchorNode;
        if (anchor.nodeType !== Node.ELEMENT_NODE) {
            anchor = anchor.parentElement;
        }
        if (anchor && anchor.closest('.o_knowledge_template')) {
            commands = commands.filter(command => command.groupName != 'Knowledge');
        }
        return commands;
    },
    /**
     * @override
     * @returns {Array[Object]}
     */
    _getCommands: function () {
        const commands = this._super();
        commands.push({
            groupName: 'Medias',
            title: 'Article',
            description: 'Link an article.',
            fontawesome: 'fa-file',
            callback: () => {
                this._insertArticleLink();
            },
        });
        if (this.options.knowledge_commands) {
            commands.push({
                groupName: 'Knowledge',
                title: 'File',
                description: 'Embed a file.',
                fontawesome: 'fa-file',
                callback: () => {
                    this.openMediaDialog({
                        noVideos: true,
                        noImages: true,
                        noIcons: true,
                        noDocuments: false
                    }, CustomMediaDialog);
                }
            }, {
                groupName: 'Knowledge',
                title: "Template",
                description: "Add a template section.",
                fontawesome: 'fa-pencil-square',
                callback: () => {
                    this._insertTemplate();
                },
            });
        }
        return commands;
    },

    /**
     * Notify @see FieldHtmlInjector that toolbars need to be injected
     * @see KnowledgeToolbar
     *
     * @param {Element} container
     */
    _notifyNewToolbars(container) {
        const toolbarsData = [];
        container.querySelectorAll('.o_knowledge_toolbar_anchor').forEach(function (container, anchor) {
            const type = Array.from(anchor.classList).find(className => className.startsWith('o_knowledge_toolbar_type_'));
            if (type) {
                toolbarsData.push({
                    container: container,
                    anchor: anchor,
                    type: type,
                });
            }
        }.bind(this, container));
        this.$editable.trigger('refresh_toolbars', { toolbarsData: toolbarsData });
    },
    /**
     * Notify @see FieldHtmlInjector that behaviors need to be injected
     * @see KnowledgeBehavior
     *
     * @param {Element} anchor
     */
    _notifyNewBehaviors(anchor) {
        const behaviorsData = [];
        const type = Array.from(anchor.classList).find(className => className.startsWith('o_knowledge_behavior_type_'));
        if (type) {
            behaviorsData.push({
                anchor: anchor,
                type: type,
            });
        }
        this.$editable.trigger('refresh_behaviors', { behaviorsData: behaviorsData});
    },
    /**
     * Insert a /template block
     */
    _insertTemplate() {
        const templateHtml = $(QWeb.render('knowledge.template_block', {}))[0].outerHTML;
        const [container] = this.odooEditor.execCommand('insertHTML', templateHtml);
        setCursorStart(container.querySelector('.o_knowledge_content > p'));
        this._notifyNewToolbars(container);
        this._notifyNewBehaviors(container);
    },
    /**
     * Insert a /article block (through a dialog)
     */
    _insertArticleLink: function () {
        const restoreSelection = preserveCursor(this.odooEditor.document);
        const dialog = new KnowledgeArticleLinkModal(this, {});
        dialog.on('save', this, data => {
            restoreSelection();
            const linkHtml = $(QWeb.render('knowledge.wysiwyg_article_link', {
                icon: data.icon,
                text: data.text,
                href: '/article/' + data.id,
                article_id: data.id,
            }))[0].outerHTML;
            const [anchor] = this.odooEditor.execCommand('insertHTML', linkHtml);
            this._notifyNewBehaviors(anchor);
            dialog.close();
        });
        dialog.on('closed', this, () => {
            restoreSelection();
        });
        dialog.open();
    },
    /**
     * Notify the @see FieldHtmlInjector when a /file block is inserted
     *
     * @private
     * @override
     */
    _onMediaDialogSave(params, element) {
        const result = this._super(...arguments);
        if (!result) {
            return;
        }
        const [container] = result;
        if (container.classList.contains('o_knowledge_file')) {
            setCursorStart(container.nextElementSibling);
            this._notifyNewToolbars(container);
            this._notifyNewBehaviors(container);
        }
        return result;
    },
});
