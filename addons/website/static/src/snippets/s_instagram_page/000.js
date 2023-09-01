/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget";

// Note that Instagram can automatically detect the language of the user and
// translate the embed.

const InstagramPage = publicWidget.Widget.extend({

    selector: ".s_instagram_page",
    disabledInEditableMode: false,

    /**
     * @override
     */
    start() {
        const iframeEl = document.createElement("iframe");
        this.$target[0].querySelector("div").appendChild(iframeEl);
        iframeEl.setAttribute("scrolling", "no");
        // We can already estimate the height of the iframe.
        iframeEl.height = this._estimateIframeHeight();
        // We have to setup the message listener before setting the src, because
        // the iframe can send a message before this JS is fully loaded.
        this.__onMessage = this._onMessage.bind(this);
        window.addEventListener("message", this.__onMessage);
        // We set the src now, we are ready to receive the message.
        iframeEl.src = `https://www.instagram.com/${this.$target[0].dataset.instagramPage}/embed`;

        return this._super(...arguments);
    },
    /**
     * @override
     */
    destroy() {
        const iframeEl = this.$target[0].querySelector("iframe");
        iframeEl.remove();
        window.removeEventListener("message", this.__onMessage);

        this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Gives an estimation of the height of the Instagram iframe.
     *
     * @private
     * @returns {number}
     */
    _estimateIframeHeight() {
        // In the meantime Instagram doesn't send us a message with the height,
        // a least-squares regression is used to estimate the height of the
        // block. We do that to reduce the page height flickering.
        const iframeEl = this.$target[0].querySelector("iframe");
        const iframeWidth = parseInt(getComputedStyle(iframeEl).width);
        return 0.698669 * iframeWidth + 159.71;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when a message is sent. Instagram sends us a message with the
     * height of the iframe.
     *
     * @private
     * @param {Event} ev
     */
    _onMessage(ev) {
        const iframeEl = this.$target[0].querySelector("iframe");
        if (ev.origin !== "https://www.instagram.com" || !JSON.parse(ev.data).type === "MEASURE") {
            // It's not a measure message from Instagram.
            return;
        }
        if (iframeEl.contentWindow !== ev.source) {
            // It's a message from another Instagram iframe.
            return;
        }
        const height = parseInt(JSON.parse(ev.data).details.height);
        // Here we get the exact height of the iframe.
        if (height) {
            // Instagram can return a height of 0 before the real height.
            iframeEl.height = height;
        }
    },
});

publicWidget.registry.InstagramPage = InstagramPage;

export default InstagramPage;
