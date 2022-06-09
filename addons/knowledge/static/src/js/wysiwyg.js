/** @odoo-module **/

import pyUtils from 'web.py_utils';
import { qweb as QWeb } from 'web.core';
import { SelectCreateDialog } from 'web.view_dialogs';
import { ComponentWrapper } from 'web.OwlCompatibility';
import { View } from './legacy_view_adapter.js';

import Wysiwyg from 'web_editor.wysiwyg';
import { KnowledgeArticleLinkModal } from './wysiwyg/knowledge_article_link.js';
import { preserveCursor, setCursorStart } from '@web_editor/../lib/odoo-editor/src/OdooEditor';

Wysiwyg.include({
    custom_events: _.extend({}, Wysiwyg.prototype.custom_events, {
        open_record: '_onOpenRecord',
    }),
    /**
     * When the user clicks on a record, the `SelectCreateDialog` will propagate
     * a `open_record` event to its parent to open the selected record. To prevent
     * that, we will catch the event and stop its propagation.
     * @param {OdooEvent} event
     */
    _onOpenRecord: function (event) {
        event.stopPropagation();
    },
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
                        noDocuments: true,
                        knowledgeDocuments: true,
                    });
                }
            }, {
                groupName: 'Knowledge',
                title: "Template",
                description: "Add a template section.",
                fontawesome: 'fa-pencil-square',
                callback: () => {
                    this._insertTemplate();
                },
            }, {
                groupName: 'Knowledge',
                title: 'Kanban view',
                description: 'Insert Kanban View',
                fontawesome: 'fa-th-large',
                callback: () => {
                    this._insertView('kanban');
                }
            }, {
                groupName: 'Knowledge',
                title: 'List view',
                description: 'Insert List View',
                fontawesome: 'fa-th-list',
                callback: () => {
                    this._insertView('tree');
                }
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
        const templateFragment = new DocumentFragment();
        const templateBlock = $(QWeb.render('knowledge.template_block', {}))[0];
        templateFragment.append(templateBlock);
        const [container] = this.odooEditor.execCommand('insertFragment', templateFragment);
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
        dialog.on('save', this, article => {
            restoreSelection();
            if (article) {
                const articleLinkFragment = new DocumentFragment();
                const articleLinkBlock = $(QWeb.render('knowledge.wysiwyg_article_link', {
                    display_name: article.display_name,
                    href: '/knowledge/article/' + article.id,
                    article_id: article.id,
                }))[0];
                articleLinkFragment.append(articleLinkBlock);
                const [anchor] = this.odooEditor.execCommand('insertFragment', articleLinkFragment);
                this._notifyNewBehaviors(anchor);
            }
            dialog.close();
        });
        dialog.on('closed', this, () => {
            restoreSelection();
        });
        dialog.open();
    },
    /**
     * Inserts a view in the editor
     * @param {String} type - View type
     */
    _insertView: async function (type) {
        const restoreSelection = preserveCursor(this.odooEditor.document);
        const data = await openActionSelector.call(this, type);
        restoreSelection();
        const viewId = data.view ? data.view_id.res_id : false;
        const viewType = type === 'tree' ? 'list' : type;
        const embededViewFragment = new DocumentFragment();
        const embededViewBlock = $(QWeb.render('knowledge.embeded_view', {
            'res_model': data.res_model,
            'name': data.name,
            'view_id': viewId,
            'view_type': viewType
        }))[0];
        embededViewFragment.append(embededViewBlock);
        const [container] = this.odooEditor.execCommand('insertFragment', embededViewFragment);
        console.log('data', data);
        console.log('context', data.context);
        console.log('container', container);
        const context = pyUtils.py_eval(data.context); // TODO: Is it safe ?
        const widget = new ComponentWrapper(this, View, {
            resModel: data.res_model,
            type: viewType,
            views: [[viewId, viewType]],
            withControlPanel: true,
            context: context,
            onPushState: () => {
                console.log('onPushState');
            },
        });
        widget.mount(container.querySelector('.o_knowledge_embeded_view_container'));
        this._notifyNewToolbars(container);
    },
    /**
     * Notify the @see FieldHtmlInjector when a /file block is inserted from a
     * @see MediaDialog
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

/**
 * Opens a new modal to let the user select an action
 * @param {Object} options (i.e: 'kanban', 'tree', 'graph', 'pivot', etc)
 * @returns {Promise}
 */
function openActionSelector (type) {
    return new Promise((resolve, reject) => {
        const dialog = new SelectCreateDialog(this, {
            title: 'Select an action',
            res_model: 'ir.actions.act_window',
            domain: [
                ['view_id', '!=', 'False'],
                ['view_mode', '=ilike', `%${type}%`],
            ],
            no_create: true,
            readonly: true,
            disable_multiple_selection: true,
        });
        dialog.on('select_record', this, ({ data }) => {
            dialog.close();
            resolve(data);
        });
        dialog.open();
    });
}
