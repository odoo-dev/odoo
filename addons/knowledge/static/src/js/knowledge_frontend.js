odoo.define('knowledge.knowledge_frontend', function (require) {
'use strict';

var publicWidget = require('web.public.widget');
var core = require('web.core');

var QWeb = core.qweb;

publicWidget.registry.KnowledgeWidget = publicWidget.Widget.extend({
    selector: '.o_knowledge_form_view',
    events: {
        'keyup #knowledge_search': '_searchArticles',
        'click .o_article_caret': '_onFold',
        'click .o_favorites_toggle_button': '_toggleFavourite',
    },

    /**
     * @override
     */
     start: function () {
        return this._super(...arguments).then(async () => {
            this._setTreeFavoriteListener();
        });
    },

    _searchArticles: function (e) {
        const $tree = $('.o_tree');
        const search = $('#knowledge_search');
        this._traverse($tree, $li => {
            const keyword = search.val().toLowerCase();
            if ($li.text().toLowerCase().indexOf(keyword) >= 0) {
                $li.show();
            }
            else {
                $li.hide();
            }
        })
    },
    /**
     * When the user clicks on the caret to hide and show some files
     * @param {Event} event
     */
    _onFold: function (event) {
        event.stopPropagation();
        const $button = $(event.currentTarget);
        const $icon = $button.find('i');
        const $li = $button.closest('li');
        const $ul = $li.find('ul');
        if ($ul.length !== 0) {
            $ul.toggle();
            if ($ul.is(':visible')) {
                $icon.removeClass('fa-caret-right');
                $icon.addClass('fa-caret-down');
            } else {
                $icon.removeClass('fa-caret-down');
                $icon.addClass('fa-caret-right');
            }
        }
    },
    /**
     * Helper function to traverses the nested list (dfs)
     * @param {jQuery} $tree
     * @param {Function} callback
     */
    _traverse: function ($tree, callback) {
        const stack = $tree.children('li').toArray();
        while (stack.length > 0) {
            const $li = $(stack.shift());
            const $ul = $li.children('ul');
            callback($li);
            if ($ul.length > 0) {
                stack.unshift(...$ul.children('li').toArray());
            }
        }
    },

    _setTreeFavoriteListener () {
        const $sortable = this.$el.find('.o_tree_favourite');
        $sortable.sortable({
            axis: 'y',
            items: 'li',
            cursor: 'grabbing',
            forcePlaceholderSize: true,
            placeholder: 'o_placeholder',
            /**
             * @param {Event} event
             * @param {Object} ui
             */
            stop: (event, ui) => {
                const $li = $(ui.item);
                const data = {
                    article_id: $li.data('article-id'),
                };
                const $next = $li.next();
                if ($next.length > 0) {
                    data.sequence = $next.data('favourite-sequence') || 0;
                }
                $sortable.sortable('disable');
                this._rpc({
                    model: 'knowledge.article.favourite',
                    method: 'set_sequence',
                    args: [[]],
                    kwargs: data,
                }).then(() => {
                    $sortable.sortable('enable');
                }).catch(() => {
                    $sortable.sortable('cancel');
                    $sortable.sortable('enable');
                });
            },
        });
    },

    _toggleFavourite: async function (e) {
        const toggleWidget = $(e.currentTarget);
        const id = toggleWidget.data('articleId');
        const article = await this._rpc({
            route: '/knowledge/article/toggle_favourite',
            params: {
                article_id: id,
            }
        });
        toggleWidget.find('i').toggleClass("fa-star", article.is_favourite).toggleClass("fa-star-o", !article.is_favourite);
        // Add/Remove the article to/from the favourite in the sidebar
        this._rpc({
            route: '/knowledge/get_favourite_tree_frontend',
            params: {
                active_article_id: id,
            }

        }).then(favouriteTemplate => {
            this.$(".o_favourite_container").replaceWith(favouriteTemplate);
            this._setTreeFavoriteListener();
        });
    }
});
});
