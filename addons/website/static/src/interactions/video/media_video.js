import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { escape } from "@web/core/utils/strings";

class MediaVideo extends Interaction {
    static selector = ".media_iframe_video";
    dynamicContent = {
        _document: {
            "t-on-optionalCookiesAccepted": this.onCookieAccepted,
        },
    }

    setup() {
        this.youtube_video = this.services.youtube_video;
    }

    start() {
        let iframeEl = this.el.querySelector(':scope > iframe');

        // The following code is only there to ensure compatibility with
        // videos added before bug fixes or new Odoo versions where the
        // <iframe/> element is properly saved.
        if (!iframeEl) {
            iframeEl = this.generateIframe();
        }

        if (this.el.dataset.needCookiesApproval) {
            this.sizeContainerEl = this.el.querySelector(":scope > .media_iframe_video_size");
            this.sizeContainerEl.classList.add("d-none");
        }

        // We don't want to cause an error that would prevent entering edit mode
        // if there is an iframe that doesn't have a src (this was possible for
        // a while with the media dialog).
        if (!iframeEl || !iframeEl.getAttribute('src')) {
            // Something went wrong: no iframe is present in the DOM and the
            // widget was unable to create one on the fly.
            return Promise.all(proms);
        }

        const promise = this.youtube_video.setupAutoplay(iframeEl.getAttribute('src'));
        if (promise) {
            promise.then(() => {
                if (proms) { this.youtube_video.triggerAutoplay(iframeEl); }
            })
        }
    }

    destroy() {
        this.showSizeContainerEl();
    }

    onCookieAccepted() {
        this.sizeContainerEl?.classList.remove("d-none");
    }

    generateIframe() {
        // Bug fix / compatibility: empty the <div/> element as all information
        // to rebuild the iframe should have been saved on the <div/> element
        this.el.innerHTML = "";

        // Add extra content for size / edition
        const div1 = document.createElement("div");
        div1.classList.add("css_editable_mode_display");
        div1.textContent = "&nbsp;";
        const div2 = document.createElement("div");
        div2.classList.add("media_iframe_video_size");
        div2.textContent = "&nbsp;";
        this.el.appendChild(div1);
        this.el.appendChild(div2);

        // Rebuild the iframe. Depending on version / compatibility / instance,
        // the src is saved in the 'data-src' attribute or the
        // 'data-oe-expression' one (the latter is used as a workaround in 10.0
        // system but should obviously be reviewed in master).

        var src = escape(this.el.getAttribute('oe-expression') || this.el.getAttribute('src'));
        // Validate the src to only accept supported domains we can trust

        var m = src.match(/^(?:https?:)?\/\/([^/?#]+)/);
        if (!m) {
            return;
        }

        var domain = m[1].replace(/^www\./, '');
        const supportedDomains = [
            "youtu.be", "youtube.com", "youtube-nocookie.com",
            "instagram.com",
            "player.vimeo.com", "vimeo.com",
            "dailymotion.com",
            "player.youku.com", "youku.com",
        ];
        if (!supportedDomains.includes(domain)) {
            return;
        }

        const iframeEl = document.createElement("iframe")
        iframeEl.frameborder = "0";
        iframeEl.allowFullscreen = "allowfullscreen";
        iframeEl.ariaLabel = _t("Media video");
        this.el.appendChild(iframeEl);
        manageIframeSrc(this.el, src);
        return iframeEl;
    }
}

registry
    .category("website.active_elements")
    .add("website.media_video", MediaVideo);
