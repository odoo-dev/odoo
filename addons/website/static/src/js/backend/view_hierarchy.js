odoo.define('website.view_hierarchy', function (require) {
"use strict";

const core = require('web.core');
const qweb = require('web.qweb');
const viewRegistry = require('web.view_registry');

const _t = core._t;

const Renderer = qweb.Renderer.extend({
    events: _.extend({}, qweb.Renderer.prototype.events, {
        'click .js_fold': '_onCollapseClick',
        'click .o_website_filter a': '_onWebsiteFilterClick',
        'click .o_search button': '_onSearchButtonClick',
        'click .o_show_diff': '_onShowDiffClick',
        'click .o_load_hierarchy': '_onLoadHierarchyClick',
        'keydown .o_search input': '_onSearchInputKeyDown',
        'input .o_search input': '_onSearchInputKeyInput',
        'change #show_inactive': '_onShowActiveClick',
    }),
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);

        // Search
        this.cptFound = 0;
        this.prevSearch = '';
    },
    /**
     * @override
     */
    on_attach_callback: function () {
        this._super.apply(this, arguments);

        const self = this;
        // Fixed Navbar
        this.$('.o_tree_container').css({
            'padding-top': this.$('.o_tree_nav').outerHeight() + 10,
        });
        // Website Filters
        this.$wNodes = this.$("li[data-website_name]");
        this.$notwNodes = this.$("li:not([data-website_name])");
        const websiteNames = _.uniq($.map(self.$wNodes, el => el.getAttribute('data-website_name')));
        for (const websiteName of websiteNames) {
            this.$('.o_website_filter').append($('<a/>', {
                class: 'dropdown-item',
                'data-website_name': websiteName,
                text: websiteName,
            }));
        }
        // Highlight requested view as google does
        const reqViewId = this.$('.o_tree_container').data('requested-view-id');
        const $reqView = $(`[data-id="${reqViewId}"] span.js_fold`).first();
        $reqView.css({'background-color': 'yellow'});
        $('.o_content').scrollTo($reqView[0], 300, {offset: -200});
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onCollapseClick: function (ev) {
        const $parent = $(ev.currentTarget).parent();
        const folded = $parent.find('.o_fold_icon').hasClass('fa-plus-square-o');
        let $ul, $oFoldIcon;
        if (folded) { // Unfold only self
            $ul = $parent.siblings('ul');
            $oFoldIcon = $parent.find('.o_fold_icon');
        } else { // Fold all
            $ul = $parent.parent().find('ul');
            $oFoldIcon = $parent.parent().find('.o_fold_icon');
        }
        $ul.toggleClass('d-none', !folded);
        $oFoldIcon.toggleClass('fa-minus-square-o', folded).toggleClass('fa-plus-square-o', !folded);
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onShowActiveClick: function (ev) {
        this.$('.is_inactive').toggleClass('d-none', !ev.currentTarget.checked);
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onWebsiteFilterClick: function (ev) {
        ev.preventDefault();
        // Update Dropdown Filter
        const $el = $(ev.currentTarget);
        $el.addClass('active').siblings().removeClass('active');
        $el.parent().siblings('.dropdown-toggle').text($el.text());

        // Show all views
        const websiteName = $el.data('website_name');
        this.$wNodes.add(this.$notwNodes).removeClass('d-none');
        if (websiteName !== '*') {
            // Hide all website views
            this.$wNodes.addClass('d-none');
            // Show selected website views
            const $selectedWebsiteNodes = this.$('li[data-website_name="' + websiteName + '"]');
            $selectedWebsiteNodes.removeClass('d-none');
            // Hide generic siblings
            $selectedWebsiteNodes.each(function () {
                $(this).siblings('li[data-key="' + $(this).data('key') + '"]:not([data-website_name])').addClass('d-none');
            });
        }
        // Preserve current inactive toggle state
        this.$('.is_inactive').toggleClass('d-none', !$('#show_inactive').prop('checked'));
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onSearchInputKeyDown: function (ev) {
        // <Tab> or <Enter>
        if (ev.which === 13 || ev.which === 9) {
            this.searchScrollTo($(ev.currentTarget).val(), !ev.shiftKey);
            ev.preventDefault();
        }
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onSearchInputKeyInput: function (ev) {
        // Useful for input empty either with ms-clear or by typing
        if (ev.currentTarget.value === "") {
            this.searchScrollTo("");
        }
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onSearchButtonClick: function (ev) {
        this.searchScrollTo(this.$('.o_search input').val());
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onShowDiffClick: function (ev) {
        ev.preventDefault();
        this.do_action('base.reset_view_arch_wizard_action', {
            additional_context: {
                'active_model': 'ir.ui.view',
                'active_ids': [parseInt(ev.currentTarget.dataset['view_id'])],
            }
        });
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onLoadHierarchyClick: function (ev) {
        ev.preventDefault();
        this.do_action('website.action_show_viewhierarchy', {
            additional_context: {
                'active_model': 'ir.ui.view',
                'active_id': parseInt(ev.currentTarget.dataset['view_id']),
            }
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Searches and scrolls to view entries matching the given text. Exact
     * matches will be returned first. Search is done on `key`, `id` and `name`
     * for exact matches, and `key`, `name` for simple matches.
     *
     * @private
     * @param {string} search text to search and scroll to
     * @param {boolean} [forward] set to false to go to previous find
     */
    searchScrollTo: function (search, forward = true) {
        const foundClasses = 'o_search_found border border-info rounded px-2';
        this.$('.o_search_found').removeClass(foundClasses);
        this.$('.o_not_found').removeClass('o_not_found');
        this.$('.o_tab_hint').remove();
        if (search !== this.prevSearch) {
            this.prevSearch = search;
            this.cptFound = -1;
        }

        if (search) {
            // Exact match first
            const exactMatches = $(`[data-key="${search}" i], [data-id="${search}" i], [data-name="${search}" i]`).not(':hidden').get();
            let matches = $(`[data-key*="${search}" i], [data-name*="${search}" i]`).not(':hidden').not(exactMatches).get();
            matches = exactMatches.concat(matches);
            if (!matches.length) {
                this.$('.o_search input').addClass('o_not_found');
            } else {
                if (forward) {
                    this.cptFound++;
                    if (this.cptFound > matches.length - 1) {
                        this.cptFound = 0;
                    }
                } else {
                    this.cptFound--;
                    if (this.cptFound < 0) {
                        this.cptFound = matches.length - 1;
                    }
                }
                const el = matches[this.cptFound];
                $(el).children('p').addClass(foundClasses).append($('<span/>', {
                    class: 'o_tab_hint text-info ml-auto small font-italic pr-2',
                    text: _.str.sprintf(_t("Press %s for next %s"), "<Tab>", `[${this.cptFound + 1}/${matches.length}]`),
                }));
                $('.o_content').scrollTo(el, 0, {offset: -200});

                this.prevSearch = search;
                this.$('.o_search input').focus();
            }
        }
    },
});

const ViewHierarchy = qweb.View.extend({
    withSearchBar: false,
    config: _.extend({}, qweb.View.prototype.config, {
        Renderer: Renderer,
    }),
});

viewRegistry.add('view_hierarchy', ViewHierarchy);
});
