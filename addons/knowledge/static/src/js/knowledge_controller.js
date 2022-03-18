/** @odoo-module */

import core from 'web.core';
import FormController from 'web.FormController';
import { MoveArticleToDialog } from 'knowledge.dialogs';
import emojis from '@mail/js/emojis';

const KnowledgeFormController = FormController.extend({
    events: Object.assign({}, FormController.prototype.events, {
        'click .o_knowledge_add_icon': '_onAddRandomIcon',
        'click #o_knowledge_add_cover': '_onAddCover',
        'click .btn-duplicate': '_onDuplicate',
        'click .btn-create': '_onCreate',
        'click .btn-move': '_onOpenMoveToModal',
        'click #knowledge_search_bar': '_onSearch',
        'change .o_breadcrumb_article_name': '_onRename',
    }),

    custom_events: Object.assign({}, FormController.prototype.custom_events, {
        create: '_onCreate',
        move: '_onMove',
        emoji_click: '_onEmojiClick',
        open: '_onOpen',
    }),

    /**
     * @override
     */
    init: function (parent, model, renderer, params) {
        this.knowledgeFormController = true;
        this._super.apply(this, arguments);
    },

    // Listeners:

    _onAddRandomIcon: async function() {
        var unicode = emojis[Math.floor(Math.random() * emojis.length)]['unicode'];
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        const result = await this._rpc({
            model: 'knowledge.article',
            method: 'write',
            args: [
                [id], { icon: unicode }
            ],
        });
        if (result) {
            this.$el.find(`[data-article-id="${id}"]`).each(function() {
                const $icon = $(this).find('.o_article_icon:first');
                $icon.text(unicode);
            });
            // FIXME: this clearly isn't the best way to do it...
            this.reload();
        }
    },

    _onAddCover: async function() {
        if (this.mode === 'readonly') {
            await this._setMode('edit');
        }
        this.$('.o_input_file').click();
    },

    /**
     * @override
     * The user will not be allowed to edit the article if it is locked.
     */
    _onQuickEdit: function () {
        const { data } = this.model.get(this.handle);
        if (data.is_locked) {
            return;
        }
        this._super.apply(this, arguments);
    },

    _onRename: async function (e) {
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        await this._rename(id, e.currentTarget.value);
    },

    /**
     * @override
     */
    _onDeletedRecords: function () {
        this.do_action('knowledge.action_home_page', {});
    },

    _onDuplicate: async function () {
        var self = this;
        this.model.duplicateRecord(this.handle).then(function (handle) {
            const { res_id } = self.model.get(handle);
            self.do_action('knowledge.action_home_page', {
                additional_context: {
                    res_id: res_id
                }
            });
        });
    },

    /**
     * @param {Event} event
     */
    _onCreate: async function (event) {
        if (event instanceof $.Event) {
            await this._create({
                category: 'private'
            });
        } else {
            await this._create(event.data);
        }
    },

    /**
     * @param {Event} event
     */
    _onMove: async function (event) {
        await this._move(event.data);
    },

    /**
     * @param {Event} event
     */
    _onOpen: async function (event) {
        const { data } = event;
        this.do_action('knowledge.action_home_page', {
            additional_context: {
                res_id: data.article_id
            }
        });
    },

    /**
     * Opens the "Move To" modal
     */
    _onOpenMoveToModal: function () {
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        const state = this.model.get(this.handle);
        const dialog = new MoveArticleToDialog(this, {}, {
            state: state,
            /**
             * @param {String} value
             */
            onSave: async value => {
                const params = { article_id: id };
                if (typeof value === 'number') {
                    params.target_parent_id = value;
                } else {
                    params.newCategory = value;
                    params.oldCategory = state.category;
                }
                await this._move({...params,
                    onSuccess: () => {
                        dialog.close();
                        this.reload();
                    },
                    onReject: () => {}
                });
            }
        });
        dialog.open();
    },

    /**
     * @param {Event} event
     */
    _onToggleChatter: function (event) {
        const $chatter = $('.o_knowledge_chatter');
        $chatter.toggleClass('d-none');
    },

    /**
     * @param {Event} event
     */
    _onSearch: function (event) {
        // TODO: change to this.env.services.commandes.openMainPalette when form views are migrated to owl
        core.bus.trigger("openMainPalette", {
            searchValue: "?",
        });
    },

    /**
     * @param {Event} event
     */
    _onEmojiClick: async function (event) {
        const { article_id, unicode } = event.data;
        const result = await this._rpc({
            model: 'knowledge.article',
            method: 'write',
            args: [[article_id], { icon: unicode }],
        });
        if (result) {
            this.$el.find(`[data-article-id="${article_id}"]`).each(function() {
                const $icon = $(this).find('.o_article_icon:first');
                $icon.text(unicode);
            });
        }
    },

    // API calls:

    /**
     * @param {Object} data
     * @param {String} data.category
     * @param {integer} data.target_parent_id
     */
    _create: async function (data) {
        const params = {};
        if (data.target_parent_id) {
            params.parent_id = data.target_parent_id;
        } else {
            params.private = data.category === 'private';
        }
        const articleId = await this._rpc({
            model: 'knowledge.article',
            method: 'article_create',
            args: [[]],
            kwargs: params,
        });
        if (!articleId) {
            return;
        }
        this.do_action('knowledge.action_home_page', {
            additional_context: {
                res_id: articleId
            }
        });
    },

    /**
     * @param {integer} id - Target id
     * @param {string} targetName - Target Name
     */
    _rename: async function (id, targetName) {
        // Change in Workspace and Private
        const $li = this.$el.find(`.o_tree [data-article-id="${id}"]`);
        $li.children(":first").find('.o_article_name').text(targetName);
        // Change in favourite if any match
        const $liFavourite = this.$el.find(`.o_tree_favourite [data-article-id="${id}"]`);
        $liFavourite.children(":first").find('.o_article_name').text(targetName);
    },

    /**
     * @param {Object} data
     * @param {integer} data.article_id
     * @param {String} data.oldCategory
     * @param {String} data.newCategory
     * @param {integer} [data.target_parent_id]
     * @param {integer} [data.before_article_id]
     * @param {Function} data.onSuccess
     * @param {Function} data.onReject
     */
    _move: async function (data) {
        const params = {
            private: data.newCategory === 'private'
        };
        if (typeof data.target_parent_id !== 'undefined') {
            params.parent_id = data.target_parent_id;
        }
        if (typeof data.before_article_id !== 'undefined') {
            params.before_article_id = data.before_article_id;
        }
        const moveArticle = () => {
            const result = this._rpc({
                model: 'knowledge.article',
                method: 'move_to',
                args: [data.article_id],
                kwargs: params
            }).then(result => {
                if (result) {
                    data.onSuccess();
                } else {
                    data.onReject();
                }
            }).catch(error => {
                data.onReject();
            })
        };
        if (data.newCategory == data.oldCategory || data.newCategory == 'shared') {
            moveArticle();
        } else {
            let message, confirmation_message;
            if (data.newCategory == 'workspace') {
                message = _t("Are you sure you want to move this to workspace? It will be accessible by everyone in the company.");
                confirmation_message = _t("Move to Workspace");
            }
            if (data.newCategory == 'private') {
                message = _t("Are you sure you want to move this to private? Only you will be able to access it.");
                confirmation_message = _t("Set as Private");
            }
            Dialog.confirm(this, message, {
                buttons: [
                    {
                        text: confirmation_message,
                        classes: 'btn-primary',
                        close: true,
                        click: moveArticle
                    }, {
                        text: _t("Discard"),
                        close: true,
                        click: data.onReject,
                    }
                ],
            });
        }
    },

    /**
     * @override
     * @param {Object} event
     */
    _onFieldChanged: function (event) {
        this._super.apply(this, arguments);
        const { changes } = event.data;
        if (typeof changes.full_width !== 'undefined') {
            this.renderer.updateFullWidthMode(changes.full_width);
        }
    },
});

export {
    KnowledgeFormController,
};
