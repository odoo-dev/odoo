/** @odoo-module */

import PermissionPanelWidget from './widgets/knowledge_permission_panel.js';
import EmojiPickerWidget from './widgets/knowledge_emoji_picker.js';
import FormRenderer from 'web.FormRenderer';
import localStorage from 'web.local_storage';


const KnowledgeFormRenderer = FormRenderer.extend({
    className: 'o_knowledge_form_view',
    events: _.extend({}, FormRenderer.prototype.events, {
        'click .o_article_caret': '_onFold',
        'click .o_article_name': '_onOpen',
        'click .o_article_create, .o_section_create': '_onCreate',
        'click .o_knowledge_share_panel': '_preventDropdownClose',
    }),

    /**
     * @override
     */
    init: function (parent, state, params) {
        this._super(...arguments);
        this.breadcrumbs = params.breadcrumbs;
    },

    _renderTree: async function () {
        const $container = this.$el.find('.o_knowledge_tree');
        let unfoldedArticles = localStorage.getItem('unfoldedArticles');
        unfoldedArticles = unfoldedArticles ? unfoldedArticles.split(";").map(Number) : false;
        return this._rpc({
            route: '/knowledge/get_tree',
            params: {
                active_article_id: this.state.res_id,
                unfolded_articles: unfoldedArticles,
            }
        }).then(res => {
            $container.empty();
            $container.append(res.template);
            this._setTreeListener();
            this._setTreeFavoriteListener();

            // Update unfoldedArticles with active article and all its parents.
            localStorage.setItem('unfoldedArticles', res.unfolded_articles.join(";"));
            this._renderEmojiPicker();
        }).catch(error => {
            $container.empty();
        });
    },

    _setTreeListener: function () {
        const $sortable = this.$el.find('.o_tree');
        $sortable.nestedSortable({
            axis: 'y',
            handle: 'div',
            items: 'li',
            listType: 'ul',
            toleranceElement: '> div',
            forcePlaceholderSize: true,
            opacity: 0.6,
            placeholder: 'bg-info',
            tolerance: 'pointer',
            helper: 'clone',
            cursor: 'grabbing',
            cancel: '.readonly',
            start: (event, ui) => {
                this.$el.find('aside').toggleClass('dragging', true);
            },
            /**
             * @param {Event} event
             * @param {Object} ui
             */
            stop: (event, ui) => {
                $sortable.sortable('disable');
                this.$el.find('aside').toggleClass('dragging', false);

                const $li = $(ui.item);
                const $section = $li.closest('section');
                const $parent = $li.parentsUntil('.o_tree', 'li');

                const data = {
                    article_id: $li.data('article-id'),
                    oldCategory: $li.data('category'),
                    newCategory: $section.data('section')
                };

                if ($parent.length > 0) {
                    data.target_parent_id = $parent.data('article-id');
                }
                const $next = $li.next();
                if ($next.length > 0) {
                    data.before_article_id = $next.data('article-id');
                }

                this.trigger_up('move', {...data,
                    onSuccess: () => {
                        $li.data('category', data.newCategory);
                        $sortable.sortable('enable');
                    },
                    onReject: () => {
                        $sortable.sortable('cancel');
                        $sortable.sortable('enable');
                    }
                });
            },
        });

        // Allow drag and drop between sections:

        const selectors = [
            'section[data-section="workspace"] .o_tree',
            'section[data-section="shared"] .o_tree',
            'section[data-section="private"] .o_tree'
        ];

        selectors.forEach(selector => {
            // Note: An element can be connected to one selector at most.
            this.$el.find(selector).nestedSortable(
                'option',
                'connectWith',
                `.o_tree:not(${selector})`
            );
        });
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

    /**
     * When the user clicks on the caret to hide and show some files
     * @param {Event} event
     */
    _onFold: async function (event) {
        event.stopPropagation();
        const $button = $(event.currentTarget);
        const $icon = $button.find('i');
        const $li = $button.closest('li');
        const $ul = $li.find('ul');
        let unfoldedArticles = localStorage.getItem('unfoldedArticles');
        unfoldedArticles = unfoldedArticles ? unfoldedArticles.split(";") : [];
        const articleId = $li.data('articleId').toString();
        if ($ul.is(':visible')) {
            if (unfoldedArticles.indexOf(articleId) !== -1) {
                unfoldedArticles.splice(unfoldedArticles.indexOf(articleId), 1);
            }
            $icon.removeClass('fa-caret-down');
            $icon.addClass('fa-caret-right');
        } else {
            if ($ul.length === 0) {
                // Call the children content
                const children = await this._rpc({
                    route: '/knowledge/get_children',
                    params: {
                        parent_id: $li.data('articleId')
                    }
                });
                $li.append($('<ul/>').append(children));
            }
            if (unfoldedArticles.indexOf(articleId) === -1) {
                unfoldedArticles.push(articleId);
            }
            $icon.removeClass('fa-caret-right');
            $icon.addClass('fa-caret-down');
        }
        $ul.toggle();
        localStorage.setItem('unfoldedArticles', unfoldedArticles.join(";"));
    },

    /**
     * @param {Event} event
     */
    _onCreate: function (event) {
        const $target = $(event.currentTarget);
        if ($target.hasClass('o_section_create')) {
            const $section = $target.closest('.o_section');
            this.trigger_up('create', {
                category: $section.data('section')
            });
        } else if ($target.hasClass('o_article_create')) {
            const $li = $target.closest('li');
            this.trigger_up('create', {
                target_parent_id: $li.data('article-id')
            });
        }
    },

    /**
     * Opens the selected record.
     * @param {Event} event
     */
    _onOpen: async function (event) {
        event.stopPropagation();
        const $li = $(event.target).closest('li');
        this.do_action('knowledge.action_home_page', {
            stackPosition: 'replaceCurrentAction',
            additional_context: {
                res_id: $li.data('article-id')
            }
        });
    },

    _renderArticleEmoji: function () {
        const { data } = this.state;
        this.$el.find('.o_article_big_emoji').text(data.icon);
    },

    /**
     * @override
     * @returns {Promise}
     */
    _renderView: async function () {
        const result = await this._super.apply(this, arguments);
        this._renderBreadcrumb();
        await this._renderTree();
        this._renderArticleEmoji();
        this._renderPermissionPanel();
        this._setResizeListener();
        return result;
    },

    _renderBreadcrumb: function () {
        const items = this.breadcrumbs.map(payload => {
            const $a = $('<a href="#"/>');
            $a.text(payload.title);
            $a.click(() => {
                this.trigger_up('breadcrumb_clicked', payload);
            });
            const $li = $('<li class="breadcrumb-item"/>');
            $li.append($a);
            return $li;
        });
        const $container = this.$el.find('.breadcrumb');
        $container.prepend(items);
    },

    /**
     * Renders the emoji picker
     */
    _renderEmojiPicker: function () {
        this.$el.find('.o_article_emoji_dropdown').one('click', event => {
            const $dropdown = $(event.currentTarget);
            const $picker = new EmojiPickerWidget(this, {
                article_id: $dropdown.data('article-id') || this.state.res_id
            });
            $picker.attachTo($dropdown);
        });
    },

    /**
     * Renders the permission panel
     */
    _renderPermissionPanel: function () {
        this.$el.find('.btn-share').one('click', event => {
            const $container = this.$el.find('.o_knowledge_permission_panel');
            const panel = new PermissionPanelWidget(this, {
                article_id: this.state.data.id,
                user_permission: this.state.data.user_permission
            });
            panel.attachTo($container);
        });
    },

    /**
     * Enables the user to resize the aside block.
     * Note: When the user grabs the resizer, a new listener will be attached
     * to the document. The listener will be removed as soon as the user releases
     * the resizer to free some resources.
     */
    _setResizeListener: function () {
        /**
         * @param {PointerEvent} event
         */
        const onPointerMove = _.throttle(event => {
            event.preventDefault();
            this.el.style.setProperty('--default-sidebar-size', `${event.pageX}px`);
        }, 100);
        /**
         * @param {PointerEvent} event
         */
        const onPointerUp = event => {
            $(document).off('pointermove', onPointerMove);
        };
        const $resizer = this.$el.find('.o_knowledge_resizer');
        $resizer.on('pointerdown', event => {
            event.preventDefault();
            $(document).on('pointermove', onPointerMove);
            $(document).one('pointerup', onPointerUp);
        });
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

    /**
     * By default, Bootstrap closes automatically the dropdown menu when the user
     * clicks inside it. To avoid that behavior, we will add a new event listener
     * on the dropdown menu that will prevent the click event from bubbling up and
     * triggering the listener closing the dropdown menu.
     * @param {Event} event
     */
    _preventDropdownClose: function (event) {
        event.stopPropagation();
    },
});

export {
    KnowledgeFormRenderer,
};
