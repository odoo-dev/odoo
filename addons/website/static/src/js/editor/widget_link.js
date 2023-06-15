/** @odoo-module **/

import { LinkTools } from '@web_editor/js/wysiwyg/widgets/link_tools';
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";

import wUtils from "website.utils";
import { debounce } from "@web/core/utils/timing";

const LINK_DEBOUNCE = 1000;

patch(LinkTools.prototype, 'website/static/src/js/editor/widget_link.js', {
    setup() {
        this.rpc = useService('rpc');
        this.rpc = this.env.services.rpc;
        return this._super.apply(this, arguments);
    },
    /**
     *
     * @override
     */
    onWillStart() {
        this._adaptPageAnchor = debounce(this._adaptPageAnchor, LINK_DEBOUNCE);
        return this._super.apply(this, arguments);
    },
    /**
     * Allows the URL input to propose existing website pages.
     *
     * @override
     */
    async start() {
        var def = await this._super.apply(this, arguments);
        const options = {
            position: {
                collision: 'flip flipfit',
            },
            classes: {
                "ui-autocomplete": 'o_website_ui_autocomplete'
            },
            body: this.$editable[0].ownerDocument.body,
        };
        // wUtils.autocompleteWithPages rely on a widget that has a _rpc and
        // trigger_up method.
        const fakeWidget = {
            _rpc: ({ route, params }) => this.rpc(route, params),
            trigger_up: this._onAutocompleteClose.bind(this),
        };
        wUtils.autocompleteWithPages(fakeWidget, this.$('input[name="url"]'), options);
        this._adaptPageAnchor();
        return def;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _adaptPageAnchor() {
        const urlInputValue = this.$('input[name="url"]').val();
        const $pageAnchor = this.$('.o_link_dialog_page_anchor');
        const isFromWebsite = urlInputValue[0] === '/';
        const $selectMenu = this.$('we-selection-items[name="link_anchor"]');

        if ($selectMenu.data("anchor-for") !== urlInputValue) { // avoid useless query
            $pageAnchor.toggleClass('d-none', !isFromWebsite);
            $selectMenu.empty();
            const always = () => $pageAnchor.find('we-toggler').text('\u00A0');
            wUtils.loadAnchors(urlInputValue, this.$editable[0].ownerDocument.body).then(anchors => {
                for (const anchor of anchors) {
                    const $option = $('<we-button class="dropdown-item">');
                    $option.text(anchor);
                    $option.data('value', anchor);
                    $selectMenu.append($option);
                }
                always();
            }).guardedCatch(always);
        }
        $selectMenu.data("anchor-for", urlInputValue);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onAutocompleteClose() {
        this._onURLInput();
    },
    /**
     * @override
     */
    _onURLInput() {
        this._super.apply(this, arguments);
        this._adaptPageAnchor();
    },
    /**
     * @override
     * @param {Event} ev
     */
    _onPickSelectOption(ev) {
        if (ev.currentTarget.closest('[name="link_anchor"]')) {
            const anchorValue = $(ev.currentTarget).data('value');
            const $urlInput = this.$('[name="url"]');
            let urlInputValue = $urlInput.val();
            if (urlInputValue.indexOf('#') > -1) {
                urlInputValue = urlInputValue.substr(0, urlInputValue.indexOf('#'));
            }
            $urlInput.val(urlInputValue + anchorValue);
        }
        this._super(...arguments);
    },
});
