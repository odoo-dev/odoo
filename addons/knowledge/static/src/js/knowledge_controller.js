/** @odoo-module */

import core from 'web.core'; 
import Dialog from 'web.Dialog';
import FormController from 'web.FormController';

var QWeb = core.qweb;
var _t = core._t;

const KnowledgeFormController = FormController.extend({
    events: Object.assign({}, FormController.prototype.events, {
        'click .btn-delete': '_onDelete',
        'click .btn-duplicate': '_onDuplicate',
        'click .btn-create': '_onCreate',
        'click .btn-move': '_onMove',
        'click .btn-share': '_onShare',
        'click .o_article_create': '_onCreate',
        'change .o_breadcrumb_article_name': '_onRename',
    }),

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

    _onDelete: async function () {
        const { id } = this.getState();
        if (typeof id === 'undefined') {
            return;
        }
        const message = _t("Are you sure you want to delete this record?");
        let dialog;
        const confirmCallback = () => {
            this._delete(id).guardedCatch(() => dialog.destroy());
        };
        dialog = Dialog.confirm(this, message, { confirm_callback: confirmCallback });
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
                                icon: record.icon,
                                text: record.name,
                            };
                        })
                    };
                }
            },
            /**
             * When the user enters a search term, the function will
             * highlight the part of the string matching with the
             * search term. (e.g: when the user types 'hello', the
             * string 'hello world' will be formatted as '<u>hello</u> world').
             * That way, the user can figure out why a search result appears.
             * @param {Object} result
             * @param {integer} result.id
             * @param {String} result.icon
             * @param {String} result.text
             * @returns {String}
             */
            formatResult: (result, _target, { term }) => {
                const { icon, text } = result;
                const pattern = new RegExp(`(${term})`, 'gi');
                return `<span class="fa ${icon}"></span> ` + (
                    term.length > 0 ? text.replaceAll(pattern, '<u>$1</u>') : text
                );
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
     * @param {integer} id - Target id
     */
    _delete: async function (id) {
        const result = await this._rpc({
            route: `/knowledge/article/${id}/delete`
        });
        if (result) {
            this.do_action('knowledge.action_home_page', {});
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
        this.do_action('knowledge.action_home_page', {
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

    /* Overrides needed to force the sidebar to be refreshed properly after each reload (or mode changes) triggered by
    the basic form controller. */

   /**
     * @override
     */
    _setMode: function (mode, recordID) {
        return this._super.apply(this, arguments).then(() => {
            this.reload();
        });
    },

    /**
     * @override
     * @returns {Promise}
     */
    reload: function () {
        return this._super.apply(this, arguments).then(() => {
            this.renderer.initTree();
        });
    },
});

export {
    KnowledgeFormController,
};
