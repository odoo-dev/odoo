odoo.define('website.s_searchbar', function (require) {
'use strict';

const concurrency = require('web.concurrency');
const publicWidget = require('web.public.widget');

const {qweb} = require('web.core');

/**
 * @todo maybe the custom autocomplete logic could be extract to be reusable
 */
publicWidget.registry.searchBar = publicWidget.Widget.extend({
    selector: '.o_searchbar_form',
    xmlDependencies: ['/website/static/src/snippets/s_searchbar/000.xml'],
    events: {
        'input .search-query': '_onInput',
        'focusout': '_onFocusOut',
        'keydown .search-query': '_onKeydown',
        'search .search-query': '_onSearch',
    },
    autocompleteMinWidth: 300,

    /**
     * @constructor
     */
    init: function () {
        this._super.apply(this, arguments);

        this._dp = new concurrency.DropPrevious();

        this._onInput = _.debounce(this._onInput, 400);
        this._onFocusOut = _.debounce(this._onFocusOut, 100);
    },
    /**
     * @override
     */
    start: function () {
        this.$input = this.$('.search-query');

        this.searchType = this.$input.data('searchType');
        this.order = this.$('.o_search_order_by').val();
        this.limit = parseInt(this.$input.data('limit'));
        this.displayDescription = !!this.$input.data('displayDescription');
        this.displayExtraLink = !!this.$input.data('displayExtraLink');
        this.displayDetail = !!this.$input.data('displayDetail');
        this.displayImage = !!this.$input.data('displayImage');
        this.wasEmpty = !this.$input.val();

        if (this.limit) {
            this.$input.attr('autocomplete', 'off');
        }

        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _fetch: function () {
        const options = {
            'displayImage': this.displayImage,
            'displayDescription': this.displayDescription,
            'displayExtraLink': this.displayExtraLink,
            'displayDetail': this.displayDetail,
        };
        const form = this.$('.o_search_order_by').parents('form');
        for (const field of form.find("input[type='hidden']")) {
            options[field.name] = field.value;
        }
        const action = form.attr('action') || window.location.pathname + window.location.search;
        const [urlPath, urlParams] = action.split('?');
        if (urlParams) {
            for (const keyValue of urlParams.split('&')) {
                const [key, value] = keyValue.split('=');
                if (value && key !== 'search') {
                    options[key] = value;
                }
            }
        }
        const pathParts = urlPath.split('/');
        for (const index in pathParts) {
            const value = pathParts[index];
            if (index > 0 && /-[0-9]+$/.test(value)) { // is sluggish
                options[pathParts[index - 1]] = value;
            }
        }
        return this._rpc({
            route: '/website/snippet/autocomplete',
            params: {
                'search_type': this.searchType,
                'term': this.$input.val(),
                'order': this.order,
                'limit': this.limit,
                'max_nb_chars': Math.round(Math.max(this.autocompleteMinWidth, parseInt(this.$el.width())) * 0.22),
                'options': options,
            },
        });
    },
    /**
     * @private
     */
    _render: function (res) {
        var $prevMenu = this.$menu;
        this.$el.toggleClass('dropdown show', !!res);
        if (res) {
            var results = res['results'];
            let template = 'website.s_searchbar.autocomplete';
            const candidate = template + '.' + this.searchType;
            if (qweb.has_template(candidate)) {
                template = candidate;
            }
            this.$menu = $(qweb.render(template, {
                results: results,
                parts: res['parts'],
                hasMoreResults: results.length < res['results_count'],
                widget: this,
            }));
            this.$menu.css('min-width', this.autocompleteMinWidth);
            this.$el.append(this.$menu);
            this.$el.find('button.extra_link').on('click', function (event) {
                event.preventDefault();
                window.location.href = event.currentTarget.dataset['target'];
            });
        }
        if ($prevMenu) {
            $prevMenu.remove();
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onInput: function () {
        if (!this.limit) {
            return;
        }
        this._dp.add(this._fetch()).then(this._render.bind(this));
    },
    /**
     * @private
     */
    _onFocusOut: function () {
        if (!this.$el.has(document.activeElement).length) {
            this._render();
        }
    },
    /**
     * @private
     */
    _onKeydown: function (ev) {
        switch (ev.which) {
            case $.ui.keyCode.ESCAPE:
                this._render();
                break;
            case $.ui.keyCode.UP:
            case $.ui.keyCode.DOWN:
                ev.preventDefault();
                if (this.$menu) {
                    let $element = ev.which === $.ui.keyCode.UP ? this.$menu.children().last() : this.$menu.children().first();
                    $element.focus();
                }
                break;
        }
    },
    /**
     * @private
     */
    _onSearch: function (ev) {
        if (!this.$input[0].value) { // clear button clicked
            this._render(); // remove existing suggestions
            this.limit = 0; // prevent autocomplete
            ev.preventDefault();
            if (!this.wasEmpty) {
                const form = this.$('.o_search_order_by').parents('form');
                form.submit();
            }
        }
    },
});
});
