/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { pick } from "@web/core/utils/objects";
import publicWidget from "@web/legacy/js/public/public_widget";
import { debounce } from "@web/core/utils/timing";
import { ObservingCookieWidgetMixin } from "@website/snippets/observing_cookie_mixin";

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

        this.loadFacebookSDK().then(() => {
            this._renderFacebookPage(params);
        })
        .catch((err) => {
            console.log("Error", err);
        });

        this.resizeObserver = new ResizeObserver(debounce(this._renderFacebookPage.bind(this, params), 100));
        this.resizeObserver.observe(this.el.parentElement);

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
    loadFacebookSDK: function() {
        return new Promise((resolve, reject) => {
            if(window.FB) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src='https://connect.facebook.net/en_US/sdk.js';
            script.async = true;
            script.onload = () => {
                FB.init({
                    xfbml: true,
                    version: 'v22.0'
                });
                resolve();
            }   
            script.onerror = reject;
            document.head.appendChild(script);
        })
    },

    /**
     * Render Facebook page plugin using Facebook SDK.
     *
     * @private
     * @param {Object} params
     */
    _renderFacebookPage: function(params){
        this._deactivateEditorObserver();

        if(this.previousWidth !== params.width) {
            this.previousWidth = params.width;

            const pageContainer = document.createElement("div");
            pageContainer.classList.add("fb-page");
            pageContainer.setAttribute("data-href", params.href);
            pageContainer.setAttribute("data-tabs",params.tabs);
            pageContainer.setAttribute("data-small-header", params.small_header || "false");
            pageContainer.setAttribute("data-hide-cover", params.hide_cover || "false");
            pageContainer.setAttribute("data-height", params.height);
            pageContainer.setAttribute("data-width", params.width);

            this.el.innerHTML = '';
            this.el.appendChild(pageContainer);
            FB.XFBML.parse(this.el);

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
