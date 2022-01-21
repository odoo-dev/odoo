/** @odoo-module */

import { qweb as QWeb, _t } from 'web.core';
import Dialog from 'web.Dialog';
import FormController from 'web.FormController';

var core = require('web.core');

const KnowledgeFormController = FormController.extend({
    events: Object.assign({}, FormController.prototype.events, {
        'click .btn-delete': '_onDelete',
        'click .btn-duplicate': '_onDuplicate',
        'click .btn-create': '_onCreate',
        'click .btn-lock': '_onLock',
        'click .btn-move': '_onMove',
        'click .btn-share': '_onShare',
        'click .o_article_create': '_onCreate',
        'click #knowledge_search_bar': '_onSearch',
        'change .o_breadcrumb_article_name': '_onRename',
    }),

    // Listeners:

    _onRename: async function (e) {
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        await this._rename(id, e.currentTarget.value);
    },

    _onDelete: async function () {
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        await this._delete(id);
    },

    _onDuplicate: async function () {
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        await this._duplicate(id);
    },

    /**
     * @param {Event} event
     */
    _onCreate: async function (event) {
        const $target = $(event.currentTarget);
        if ($target.hasClass('o_article_create')) {  // '+' button in side panel
            const $li = $target.closest('li');
            const id = $li.data('article-id');
            await this._create(id);
        } else {  // main 'Create' button
            await this._create(false, true);
        }
    },

    _onMove: function () {
        // TODO: Add (prepend) 'Workspace' and 'Private' to the dropdown list.
        // So the article can be moved to the root of workspace or private, without any particular parent.
        const $content = $(QWeb.render('knowledge.knowledge_move_article_to_modal'));
        const $input = $content.find('input');
        $input.select2({
            ajax: {
                url: '/knowledge/get_articles',
                dataType: 'json',
                /**
                 * @param {String} term
                 * @returns {Object}
                 */
                data: term => {
                    return { query: term, limit: 30 };
                },
                /**
                 * @param {Array[Object]} records
                 * @returns {Object}
                 */
                results: records => {
                    return {
                        results: records.map(record => {
                            return {
                                id: record.id,
                                text: record.name
                            };
                        })
                    };
                }
            },
            /**
             * @param {Object} result
             * @param {integer} result.id
             * @param {string} result.text
             * @returns {String}
             */
            formatResult: result => {
                return '<span class="fa fa-file"></span> ' + _.escape(result.text);
            },
        });
        const dialog = new Dialog(this, {
            title: _t('Move Article Under'),
            $content: $content,
            buttons: [{
                text: _t('Save'),
                classes: 'btn-primary',
                click: async () => {
                    const state = this.getState();
                    const src = state.id;
                    const dst = parseInt($input.val());
                    await this._move(src, dst);
                    dialog.close();
                }
            }, {
                text: _t('Discard'),
                close: true
            }]
        });
        dialog.open();
    },

    _onShare: function () {
        const $content = $(QWeb.render('knowledge.knowledge_share_an_article_modal'));
        const dialog = new Dialog(this, {
            title: _t('Share a Link'),
            $content: $content,
            buttons: [{
                text: _t('Save'),
                classes: 'btn-primary',
                click: async () => {
                    console.log('sharing the article...');
                }
            }, {
                text: _t('Discard'),
                click: async () => {
                    dialog.close();
                }
            }]
        });
        dialog.open();
    },

    /**
     * @param {Event} event
     */
    _onLock: function (event) {
        const $target = $(event.target);
        const $icon = $target.find('i');
        if ($icon.hasClass('fa-lock')) {
            $icon.removeClass('fa-lock');
            $icon.addClass('fa-unlock');
            this._setMode('edit');
        } else {
            $icon.removeClass('fa-unlock');
            $icon.addClass('fa-lock');
            this._setMode('readonly');
        }
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
    // API calls:

    /**
     * @param {integer} id - Parent id
     */
    _create: async function (id, setPrivate) {
        const articleId = await this._rpc({
            route: `/knowledge/article/create`,
            params: {
                target_parent_id: id,
                private: setPrivate
            }
        });
        if (!articleId) {
            return;
        }
        this.do_action('knowledge.action_show_article', {
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
        const result = await this._rpc({
            route: `/knowledge/article/${id}/rename`,
            params: {
                title: targetName
            }
        });
        if (result) {
            // Change in Workspace and Private
            const $li = this.$el.find(`.o_tree [data-article-id="${id}"]`);
            $li.children(":first").find('.o_article_name').text(result);
            // Change in favourite if any match
            const $liFavourite = this.$el.find(`.o_tree_favourite [data-article-id="${id}"]`);
            $liFavourite.children(":first").find('.o_article_name').text(result);
        }
    },

    /**
     * @param {integer} id - Target id
     */
    _delete: async function (id) {
        const result = await this._rpc({
            route: `/knowledge/article/${id}/delete`
        });
        if (result) {
            this.do_action('knowledge.action_show_article', {});
        }
    },

    /**
     * @param {integer} id - Target id
     */
    _duplicate: async function (id) {
        const articleId = await this._rpc({
            route: `/knowledge/article/${id}/duplicate`
        });
        if (!articleId) {
            return;
        }
        this.do_action('knowledge.action_show_article', {
            additional_context: {
                res_id: articleId
            }
        });
    },

    /**
     * @param {integer} src
     * @param {integer} dst
     */
    _move: async function (src, dst) {
        const result = await this._rpc({
            route: `/knowledge/article/${src}/move`,
            params: {
                target_parent_id: dst
            }
        });
        const $parent = this.$el.find(`.o_tree [data-article-id="${dst}"]`);
        if (result && $parent.length !== 0) {
            let $li = this.$el.find(`.o_tree [data-article-id="${src}"]`);
            let $ul = $parent.find('ul:first');
            if ($ul.length === 0) {
                $ul = $('<ul>');
                $parent.append($ul);
            }
            $ul.append($li);
        }
    },

    // Helpers:

    /**
     * @override
     */
    _setMode: function () {
        return this._super.apply(this, arguments).then(() => {
            this.renderer.initTree();
        });
    },
});

export {
    KnowledgeFormController,
};
