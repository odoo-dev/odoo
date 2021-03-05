odoo.define('website_blog.s_blog_posts_options', function (require) {
'use strict';

const options = require('web_editor.snippets.options');
const dynamicSnippetOptions = require('website.s_dynamic_snippet_options');

var wUtils = require('website.utils');

const dynamicSnippetBlogPostsOptions = dynamicSnippetOptions.extend({
    /**
     *
     * @override
     */
    onBuilt: function () {
        this._super.apply(this, arguments);
        this._rpc({
            model: 'ir.model.data',
            method: 'search_read',
            kwargs: {
                domain: [['module', '=', 'website_blog'], ['model', '=', 'website.snippet.filter']],
                fields: ['id', 'res_id'],
            }
        }).then((data) => {
            this.$target.get(0).dataset.filterId = data[0].res_id;
            this.$target.get(0).dataset.numberOfRecords = this.dynamicFilters[data[0].res_id].limit;
            this._refreshPublicWidgets();
            // Refresh is needed because default values are obtained after start()
        });
    },
    start: function () {
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     *
     * @override
     * @private
     */
    _computeWidgetVisibility: function (widgetName, params) {
        if (widgetName === 'filter_opt') {
            return false;
        }
        if (widgetName === 'hover_effect_opt') {
            return this.$target.get(0).dataset.templateKey === 'website_blog.dynamic_filter_template_blog_posts_big_picture';
        }
        return this._super.apply(this, arguments);
    },
    /**
     * Fetches blogs.
     * @private
     * @returns {Promise}
     */
    _fetchBlogs: function () {
        return this._rpc({
            model: 'blog.blog',
            method: 'search_read',
            kwargs: {
                domain: wUtils.websiteDomain(this),
                fields: ['id', 'name'],
            }
        });
    },
    /**
     *
     * @override
     * @private
     */
    _renderCustomXML: async function (uiFragment) {
        await this._super.apply(this, arguments);
        await this._renderBlogSelector(uiFragment);
    },
    /**
     * Automatically assign class on template selection
     * @override
     */
    _renderSelectUserValueWidgetButtons: async function (selectUserValueWidgetElement, data) {
        for (let id in data) {
            const button = document.createElement('we-button');
            button.dataset.selectDataAttribute = id;
            if (id.startsWith("website_blog.dynamic_filter_template_")) {
                button.dataset.selectClass = id.replace("website_blog.dynamic_filter_template_", "s_");
            }
            button.innerHTML = data[id].name;
            selectUserValueWidgetElement.appendChild(button);
        }
    },
    /**
     * Renders the blog option selector content into the provided uiFragment.
     * @private
     * @param {HTMLElement} uiFragment
     */
    _renderBlogSelector: async function (uiFragment) {
        const blogsList = await this._fetchBlogs();
        const blogs = {};
        for (let index in blogsList) {
            blogs[blogsList[index].id] = blogsList[index];
        }
        const blogSelectorEl = uiFragment.querySelector('[data-name="blog_opt"]');
        return this._renderSelectUserValueWidgetButtons(blogSelectorEl, blogs);
    },
    /**
     * Sets default options values.
     * @override
     * @private
     */
    _setOptionsDefaultValues: function () {
        this._super.apply(this, arguments);
        const templateKeys = this.$el.find("we-select[data-attribute-name='templateKey'] we-selection-items we-button");
        if (templateKeys.length > 0) {
            this._setOptionValue('templateKey', templateKeys.attr('data-select-data-attribute'));
        }
        const blogs = this.$el.find("we-select[data-attribute-name='filterByBlogId'] we-selection-items we-button");
        if (blogs.length > 0) {
            this._setOptionValue('filterByBlogId', blogs.attr('data-select-data-attribute'));
        }
        const orders = this.$el.find("we-select[data-attribute-name='order'] we-selection-items we-button");
        if (orders.length > 0) {
            this._setOptionValue('order', orders.attr('data-select-data-attribute'));
        }
    },
});

options.registry.dynamic_snippet_blog_posts = dynamicSnippetBlogPostsOptions;

return dynamicSnippetBlogPostsOptions;
});
