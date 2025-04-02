/** @odoo-module **/

import { pick } from "@web/core/utils/objects";
import publicWidget from "@web/legacy/js/public/public_widget";
import { debounce } from "@web/core/utils/timing";
import { ObservingCookieWidgetMixin } from "@website/snippets/observing_cookie_mixin";
import { loadJS } from "@web/core/assets";

const FacebookPageWidget = publicWidget.Widget.extend(ObservingCookieWidgetMixin, {
    selector: '.o_facebook_page',
    disabledInEditableMode: false,

    /**
     * @override
     */
    start: function () {
        var def = this._super.apply(this, arguments);
        this.previousWidth = 0;

        // Making the snippet non-editable.
        // TODO adapt xml changes by adding "o_not_editable" class
        // to s_facebook_page snippet in master.
        this.el.classList.add("o_not_editable");

        const params = pick(this.$el[0].dataset, 'href', 'id', 'height', 'width', 'tabs', 'small_header', 'hide_cover');
        if (!params.href) {
            return def;
        }
        if (params.id) {
            params.href = `https://www.facebook.com/${params.id}`;
        }
        delete params.id;

        // Dynamically load Facebook SDK
        this.loadFacebookSDK().then(() => {
            this.renderFacebookPage(params);
        });

        const isMobile = window.matchMedia("(max-width: 480px)").matches;
        if (!isMobile) {
            this.resizeObserver = new ResizeObserver(
                debounce(this.handleResize.bind(this, params), 100)
            );
            this.resizeObserver.observe(this.el.parentElement);
        }

        return def;
    },
    /**
     * @override
     */
    destroy: function () {
        this._super.apply(this, arguments);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Dynamically loads the Facebook SDK.
     *
     * @private
     * @returns {Promise}
     */
    loadFacebookSDK: function () {
        if (window.FB) {
            return Promise.resolve();
        }
    
        return loadJS("https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v22.0")
            .then(() => {
                return new Promise((resolve) => {
                    window.fbAsyncInit = function () {
                        window.FB.init({
                            xfbml: true,
                            version: "v22.0"
                        });
                        resolve();
                    };
                });
            })
            .catch((error) => {
                throw new Error(`Failed to load Facebook SDK: ${error}`);
            });
    },

    /**
     * Handles element resize and triggers render if needed.
     * @param {Object} params
     */
    handleResize(params) {
        const currentWidth = this.el.offsetWidth;
        if (Math.abs(currentWidth - this.previousWidth) > 10) {
            this.previousWidth = currentWidth;
            params.width = currentWidth;
            this.renderFacebookPage(params);
        }
    },

    /**
     * Render Facebook page plugin using Facebook SDK.
     *
     * @private
     * @param {Object} params
     */
    renderFacebookPage: function (params) {
        this._deactivateEditorObserver();

        if (this.previousWidth !== params.width) {
            this.previousWidth = params.width;

            const fbPage = document.createElement("div");
            fbPage.classList.add("fb-page");
            fbPage.setAttribute("data-href", params.href);
            fbPage.setAttribute("data-tabs",params.tabs);
            fbPage.setAttribute("data-small-header", params.small_header);
            fbPage.setAttribute("data-hide-cover", params.hide_cover);
            fbPage.setAttribute("data-height", params.height);
            fbPage.setAttribute("data-width", params.width);
            this.el.replaceChildren(fbPage);

            if (typeof window.FB !== "undefined") {
                window.FB.XFBML.parse(this.el);
            }
        }
        this._activateEditorObserver();
    },

    /**
     * Activates the editor observer if it exists.
     */
    _activateEditorObserver() {
        this.options.wysiwyg && this.options.wysiwyg.odooEditor.observerActive();
    },

    /**
     * Deactivates the editor observer if it exists.
     */
    _deactivateEditorObserver() {
        this.options.wysiwyg && this.options.wysiwyg.odooEditor.observerUnactive();
    },
});

publicWidget.registry.facebookPage = FacebookPageWidget;

export default FacebookPageWidget;
