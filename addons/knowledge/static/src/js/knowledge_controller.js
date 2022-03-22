/** @odoo-module */

import { _t, bus } from 'web.core';
import Dialog from 'web.Dialog';
import FormController from 'web.FormController';
import { MoveArticleToDialog } from 'knowledge.dialogs';

const KnowledgeFormController = FormController.extend({
    events: Object.assign({}, FormController.prototype.events, {
        'click .btn-duplicate': '_onDuplicate',
        'click .btn-create': '_onCreate',
        'click .btn-move': '_onOpenMoveToModal',
        'click .btn-archive': '_onArchive',
        'change .o_breadcrumb_article_name': '_onRename',
        'click i.o_toggle_favourite': '_onToggleFavourite',
        'input .o_breadcrumb_article_name': '_adjustInputSize',
    }),

    custom_events: Object.assign({}, FormController.prototype.custom_events, {
        create: '_onCreate',
        move: '_onMove',
        reload_tree: '_onReloadTree',
        emoji_click: '_onEmojiClick',
    }),

    init: function (parent, model, renderer, params) {
        this.renderer = renderer;
        this._super.apply(this, arguments);
    },

    // Listeners:

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

    _adjustInputSize: async function (e) {
        e.target.setAttribute('size', e.target.value.length);
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
        await this._confirmMove(event.data);
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
                    params.oldCategory = state.data.category;
                }
                await this._confirmMove({...params,
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
    _onReloadTree: function (event) {
        // TODO JBN: Create a widget for the tree and reload it without reloading the whole view.
        this.reload();
    },

    _onArchive: function () {
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        // go to home page
        this.do_action('knowledge.action_home_page', {});
    },

    _onToggleFavourite: async function (event) {
        const self = this;
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        const result = await this._toggleFavourite(id);
        $(event.target).toggleClass('fa-star-o', !result).toggleClass('fa-star', result);
        event.target.title = result ? _t('Remove from favourites') : _t('Add to favourites');
        this._rpc({
            route: '/knowledge/get_favourite_tree',
            params: {
                res_id: id,
            }

        }).then(favouriteTemplate => {
            self.$(".o_favourite_container").replaceWith(favouriteTemplate);
            this.renderer._setTreeFavoriteListener();
            this.renderer._renderEmojiPicker();
        });
   },

    /**
     * @param {Event} event
     */
    _onEmojiClick: async function (event) {
        const { articleId, unicode } = event.data;
        const result = await this._rpc({
            model: 'knowledge.article',
            method: 'write',
            args: [[articleId], { icon: unicode }],
        });
        if (result) {
            this.$el.find(`[data-article-id="${articleId}"]`).each(function() {
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
        const articleId = await this._rpc({
            model: 'knowledge.article',
            method: 'article_create',
            args: [[]],
            kwargs: {
                private: data.category === 'private',
                parent_id: data.target_parent_id ? data.target_parent_id : false
            },
        });
        if (!articleId) {
            return;
        }
        this.do_action('knowledge.action_home_page', {
            stackPosition: 'replaceCurrentAction',
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
    _confirmMove: async function (data) {
        data['params'] = {
            private: data.newCategory === 'private'
        };
        if (typeof data.target_parent_id !== 'undefined') {
            data['params'].parent_id = data.target_parent_id;
        }
        if (typeof data.before_article_id !== 'undefined') {
            data['params'].before_article_id = data.before_article_id;
        }
        if (data.newCategory == data.oldCategory) {
            await this._move(data);
        } else {
            let message, confirmation_message;
            if (data.newCategory == 'workspace') {
                message = _t("Are you sure you want to move this to workspace? It will be accessible by everyone in the company.");
                confirmation_message = _t("Move to Workspace");
            }
            else if (data.newCategory == 'private') {
                message = _t("Are you sure you want to move this to private? Only you will be able to access it.");
                confirmation_message = _t("Set as Private");
            }
            Dialog.confirm(this, message, {
                buttons: [{
                            text: confirmation_message,
                            classes: 'btn-primary',
                            close: true,
                            click: async () => {
                                await this._move(data);
                            }
                        }, {
                            text: _t("Discard"),
                            close: true,
                            click: data.onReject,
                        }],
            });
        }

    },

    /**
     * @param {Object} data
     * @param {integer} data.article_id
     * @param {Function} data.onSuccess
     * @param {Function} data.onReject
     * @param {Object} data.params
     */
    _move: async function (data) {
        return this._rpc({
            model: 'knowledge.article',
            method: 'move_to',
            args: [data.article_id],
            kwargs: data.params
        }).then(result => {
            if (result) {
                data.onSuccess();
            } else {
                data.onReject();
            }
        }).catch(error => {
            data.onReject();
        })
    },

    _toggleFavourite: async function (articleId) {
        this.saveChanges(this.handle);
        return await this._rpc({
            model: 'knowledge.article',
            method: 'action_toggle_favourite',
            args: [articleId]
        });
    },
});

export {
    KnowledgeFormController,
};
