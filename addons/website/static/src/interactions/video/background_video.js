import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { uniqueId } from "@web/core/utils/functions";
import { throttleForAnimation } from "@web/core/utils/timing";
import { renderToElement } from "@web/core/utils/render";

class BackgroundVideo extends Interaction {
    static selector = ".o_background_video";
    dynamicContent = {
        _document: {
            "t-on-optionalCookiesAccepted": this.onCookieAccepted,
        },
        _window: {
            "t-on-resize": this.onResize,
        },
        _modal: {
            "t-on-show.bs.modal": this.onShowModal,
            "t-on-shown.bs.modal": this.onShownModal,
        },
    }

    setup() {
        this.youtube_video = this.services.youtube_video;
    }

    start() {
        this.videoSrc = this.el.dataset.bgVideoSrc;
        this.iframeID = uniqueId("o_bg_video_iframe_");

        const promise = this.youtube_video.setupAutoplay(iframeEl.getAttribute("src"));
        if (promise) {
            this.videoSrc += "&enablejsapi=1";
        }

        this.throttledUpdate = throttleForAnimation(() => this.adjustIframe());

        const dropdownMenu = this.el.closest(".dropdown-menu");
        if (dropdownMenu.length) {
            this.dropdownParent = dropdownMenu.parentElement;
            this.dropdownParent.addEventListener("shown.bs.dropdown", this.throttledUpdate);
        }

        promise.then(() => this.appendBgVideo());
    }

    destroy() {
        if (this.dropdownParent) {
            this.dropdownParent.removeEventListener("shown.bs.dropdown", this.throttledUpdate);
        }

        this.throttledUpdate.cancel();

        this.bgVideoContainer?.remove();
    }

    adjustIframe() {
        if (!this.iframe) {
            return;
        }

        this.iframe.removeClass("show");

        // Adjust the iframe
        var wrapperWidth = this.el.innerWidth;
        var wrapperHeight = this.el.innerHeight;
        var relativeRatio = (wrapperWidth / wrapperHeight) / (16 / 9);

        if (relativeRatio >= 1.0) {
            this.iframe.style.width = "100%";
            this.iframe.style.height = (relativeRatio * 100) + "%";
            this.iframe.style.insetInlineStart = "0";
            this.iframe.style.insetBlockStart = (-(relativeRatio - 1.0) / 2 * 100) + "%";
        } else {
            this.iframe.style.width = ((1 / relativeRatio) * 100) + "%";
            this.iframe.style.height = "100%";
            this.iframe.style.insetInlineStart = (-((1 / relativeRatio) - 1.0) / 2 * 100) + "%";
            this.iframe.style.insetBlockStart = "0";
        }

        void this.iframe.offsetWidth; // Force style addition
        this.iframe.classList.add("show");
    }

    appendBgVideo() {
        const allowedCookies = !this.el.dataset.needCookiesApproval;

        const oldContainer = this.bgVideoContainer || this.querySelector(":scope > .o_bg_video_container");
        this.bgVideoContainer = renderToElement("website.background.video", {
            videoSrc: allowedCookies ? this.videoSrc : "about:blank",
            iframeID: this.iframeID,
        });

        this.iframe = this.bgVideoContainer.querySelector(".o_bg_video_iframe");
        this.iframe.addEventListener("load", () => {
            this.bgVideoContainer.find(".o_bg_video_loading").remove();
            // When there is a "slide in (left or right) animation" element, we
            // need to adjust the iframe size once it has been loaded, otherwise
            // an horizontal scrollbar may appear.
            this.adjustIframe();
        });
        this.el.insertAdjacentHTML("afterbegin", this.bgVideoContainer);
        oldContainer.remove();

        this.adjustIframe();
        this.youtube_video.triggerAutoplay(this.iframe);
    }

    onCookieAccepted() {
        this.iframeEl.src = this.videoSrc;
    }

    onResize() {
        this.throttledUpdate();
    }

    onShowModal() {
        this.el.querySelector(".o_bg_video_container").classList.add("d-none");

    }

    onShownModal() {
        this.el.querySelector(".o_bg_video_container").classList.remove("d-none");
    }
}

registry
    .category("website.active_elements")
    .add("website.background_video", BackgroundVideo);

