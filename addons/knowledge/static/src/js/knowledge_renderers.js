/** @odoo-module */

import FormRenderer from 'web.FormRenderer';

const KnowledgeFormRenderer = FormRenderer.extend({
    events: _.extend({}, FormRenderer.prototype.events, {
        'click .fa': '_onDropdown',
        'click .article': '_onOpen',
    }),

    init: function () {
        console.log('calling init');
        return this._super.apply(this, arguments);
    },

    /**
     * @override
     * @returns {Promise}
     */
    start: function () {
        console.log('calling start');
        return this._super.apply(this, arguments).then(() => {
            const aside = this.$el.find('.o_sidebar');
            this._rpc({
                route: '/knowledge/get_tree',
                params: {}
            }).then(res => {
                aside.html(res);
                this.createTree();
            }).catch(error => {
                console.log('error', error);
                aside.empty();
            });
        });
    },

    createTree: function () {
        this.$el.find('.o_tree').nestedSortable({
            axis: 'y',
            handle: 'div',
            items: 'li',
            listType: 'ul',
            toleranceElement: '> div',
            forcePlaceholderSize: true,
            opacity: 0.6,
            placeholder: 'o_placeholder',
            tolerance: 'pointer',
            helper: 'clone',
            /**
             * @param {Event} event 
             * @param {Object} ui 
             */
            relocate: async (event, ui) => {
                const $li = $(ui.item);
                const key = 'article-id';
                const params = {};
                const $parent = $li.parents('li');
                if ($parent.length !== 0) {
                    params.target_parent_id = $parent.data(key);
                }
                const $sibling = $li.next();
                if ($sibling.length !== 0) {
                    params.before_article_id = $sibling.data(key);
                }
                await this._rpc({
                    route: `/knowledge/article/${$li.data(key)}/move`,
                    params
                });
                const $tree = $(event.target);
                this._refreshIcons($tree);
            }
        });

        // We set the listeners:

        // this.$el.find('.o_tree').on('sortreceive', (event, ui) => {
        //     console.log('receive event', event, 'ui', ui);
        // });

        // this.$el.find('.o_tree').on('sortremove', (event, ui) => {
        //     console.log('remove event', event, 'ui', ui);
        // });

        // We connect the trees:

        this.$el.find('.o_tree_workspace .o_tree').nestedSortable(
            'option',
            'connectWith',
            '.o_tree_private .o_tree'
        );

        this.$el.find('.o_tree_private .o_tree').nestedSortable(
            'option',
            'connectWith',
            '.o_tree_workspace .o_tree'
        );
    },

    /**
     * When the user clicks on the caret to hide and show some files
     * @param {Event} event
     */
    _onDropdown: function (event) {
        const $icon = $(event.target);
        const $li = $icon.closest('li');
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
     * Opens the selected record.
     * @param {Event} event
     */
    _onOpen: async function (event) {
        event.stopPropagation();
        const $li = $(event.target).closest('li');
        this.do_action('knowledge.action_show_article', {
            additional_context: {
                res_id: $li.data('article-id')
            }
        });
    },

    /**
     * Refresh the icons
     */
    _refreshIcons: function ($tree) {
        this._traverse($tree, ($li) => {
            if ($li.has('ol').length > 0) {
                // todo
            } else {
                // todo
            }
        });
    },

    /**
     * Helper function to traverses the nested list (dfs)
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
});

export {
    KnowledgeFormRenderer,
};
