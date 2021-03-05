odoo.define('website_blog.s_blog_posts_frontend', function (require) {
'use strict';

const core = require('web.core');
var publicWidget = require('web.public.widget');
const DynamicSnippet = require('website.s_dynamic_snippet');

const DynamicSnippetBlogPosts = DynamicSnippet.extend({
    selector: '.s_dynamic_snippet_blog_posts',
    xmlDependencies: ['/website_blog/static/src/snippets/s_blog_posts/000.xml'],
    disabledInEditableMode: false,

    /**
     *
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.template_key = 'website_blog.s_blog_posts.wrapper';
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Method to be overridden in child components if additional configuration elements
     * are required in order to fetch data.
     * @override
     * @private
     */
    _isConfigComplete: function () {
        return this._super.apply(this, arguments) && this.$el.get(0).dataset.filterByBlogId !== undefined;
    },
    /**
     * Method to be overridden in child components in order to prepare content
     * when there is no data to display.
     * @private
     */
    _getEmptyContent: function () {
        return core.qweb.render(
            'website_blog.s_blog_posts.empty',
            this._getQWebRenderOptions()
        );
    },
    /**
     *
     * @override
     * @private
     */
    _mustMessageWarningBeHidden: function () {
        const isInitialDrop = this.$el.get(0).dataset.templateKey === undefined;
        // This snippet has default values obtained after the initial start and render after drop.
        // Because of this there is an initial refresh happening right after.
        // We want to avoid showing the incomplete config message before this refresh.
        // Since the refreshed call will always happen with a defined templateKey,
        // if it is not set yet, we know it is the drop call and we can avoid showing the message.
        return isInitialDrop || this._super.apply(this, arguments);
    },
    /**
     * Method to be overridden in child components in order to provide a search
     * domain if needed.
     * @override
     * @private
     */
    _getSearchDomain: function () {
        const searchDomain = this._super.apply(this, arguments);
        const filterByBlogId = parseInt(this.$el.get(0).dataset.filterByBlogId);
        if (filterByBlogId >= 0) {
            searchDomain.push(['blog_id', '=', filterByBlogId]);
        }
        return searchDomain;
    },
    _getOrder: function () {
        return this.$el.get(0).dataset.order;
    },

    /**
     * TODO To remove once merged with branch having _getRpcParameters(): return 'order' in there
     * @override
     */
    _fetchData: function () {
        if (this._isConfigComplete()) {
            return this._rpc(
                {
                    'route': '/website/snippet/filters',
                    'params': {
                        'filter_id': parseInt(this.$el.get(0).dataset.filterId),
                        'template_key': this.$el.get(0).dataset.templateKey,
                        'limit': parseInt(this.$el.get(0).dataset.numberOfRecords),
                        'search_domain': this._getSearchDomain(),
                        'with_sample': this.editableMode,
                        'order': this._getOrder(),
                    },
                })
                .then(
                    (data) => {
                        this.data = data;
                    }
                );
        } else {
            return new Promise((resolve) => {
                this.data = [];
                resolve();
            });
        }
    },

});
publicWidget.registry.blog_posts = DynamicSnippetBlogPosts;

return DynamicSnippetBlogPosts;
});
