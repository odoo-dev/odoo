import { _t } from "@web/core/l10n/translation";
import { Component, useState, onMounted, useRef } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";
import { deduceURLfromText } from "./utils";
import { KeepLast } from "@web/core/utils/concurrency";

export class LinkPopover extends Component {
    static template = "html_editor.linkPopover";
    static props = {
        linkEl: { validate: (el) => el.nodeType === Node.ELEMENT_NODE },
        onApply: Function,
        onRemove: Function,
        onCopy: Function,
    };
    setup() {
        this.state = useState({
            editing: this.props.linkEl.href ? false : true,
            url: this.props.linkEl.href || "",
            label: this.props.linkEl.textContent || "",
        });
        this.notificationService = useService("notification");

        this.urlLink = useRef("urlLink");
        this.previewFaviconFa = useRef("previewFaviconFa");
        this.previewFaviconImg = useRef("previewFaviconImg");
        this.fullUrl = useRef("fullUrl");

        this.keepLastPromise = new KeepLast();

        onMounted(() => {
            if (!this.state.editing) {
                this.urlLink.el.href = this.state.url;
                this.fullUrl.el.href = this.state.url;
                this.loadAsyncLinkPreview();
            }
        });
    }
    onClickApply() {
        this.state.editing = false;
        if (this.state.label === "") {
            this.state.label = this.state.url;
        }
        const deducedUrl = this.deduceUrl(this.state.url);
        this.state.url = deducedUrl
            ? this.correctLink(deducedUrl)
            : this.correctLink(this.state.url);
        this.props.onApply(this.state.url, this.state.label);
    }
    onClickEdit() {
        this.state.editing = true;
        this.state.url = this.props.linkEl.href;
        this.state.label = this.props.linkEl.textContent;
    }
    async onClickCopy(ev) {
        ev.preventDefault();
        await browser.navigator.clipboard.writeText(this.props.linkEl.href || "");
        this.notificationService.add(_t("Link copied to clipboard."), {
            type: "success",
        });
        this.props.onCopy();
    }
    onClickRemove() {
        this.props.onRemove();
    }

    /**
     * @private
     */
    correctLink(url) {
        if (url.indexOf("tel:") === 0) {
            url = url.replace(/^tel:([0-9]+)$/, "tel://$1");
        } else if (
            url &&
            !url.startsWith("mailto:") &&
            url.indexOf("://") === -1 &&
            url[0] !== "/" &&
            url[0] !== "#" &&
            url.slice(0, 2) !== "${"
        ) {
            url = "http://" + url;
        }
        return url;
    }
    deduceUrl(text) {
        text = text.trim();
        if (/^(https?:|mailto:|tel:)/.test(text)) {
            // Text begins with a known protocol, accept it as valid URL.
            return text;
        } else {
            return deduceURLfromText(text, this.props.linkEl) || "";
        }
    }
    resetPreview() {
        this.previewFaviconFa.el.classList.remove(
            "d-none",
            "fa-question-circle-o",
            "fa-envelope-o",
            "fa-phone"
        );
        this.previewFaviconFa.el.classList.add("fa-globe");
        this.previewFaviconImg.el.classList.add("d-none");

        this.urlLink.el.textContent = this.state.url || _t("No URL specified");
        this.urlLink.el.href = this.state.url || null;

        this.fullUrl.el.textContent = this.state.url || _t("No URL specified");
        this.fullUrl.el.href = this.state.url || null;
        this.fullUrl.el.classList.add("d-none");
        this.fullUrl.el.classList.remove("o_we_webkit_box");
    }
    async loadAsyncLinkPreview() {
        let url;
        if (this.state.url === "") {
            this.resetPreview("");
            this.previewFaviconFa.el.classList.remove("fa-globe");
            this.previewFaviconFa.el.classList.add("fa-question-circle-o");
            return;
        }

        try {
            url = new URL(this.state.url); // relative to absolute
        } catch {
            // Invalid URL, might happen with editor unsuported protocol. eg type
            // `geo:37.786971,-122.399677`, become `http://geo:37.786971,-122.399677`
            this.notificationService.add(_t("This URL is invalid. Preview couldn't be updated."), {
                type: "danger",
            });
            return;
        }
        this.resetPreview(url);
        const protocol = url.protocol;
        if (!protocol.startsWith("http")) {
            const faMap = { "mailto:": "fa-envelope-o", "tel:": "fa-phone" };
            const icon = faMap[protocol];
            if (icon) {
                this.previewFaviconFa.el.classList.toggle("fa-globe");
                this.previewFaviconFa.el.classList.toggle(icon);
            }
        } else if (window.location.hostname !== url.hostname) {
            // Preview pages from current website only. External website will
            // most of the time raise a CORS error. To avoid that error, we
            // would need to fetch the page through the server (s2s), involving
            // enduser fetching problematic pages such as illicit content.
            this.previewFaviconImg.el.src = `https://www.google.com/s2/favicons?sz=16&domain=${encodeURIComponent(
                url
            )}`;
            this.previewFaviconImg.el.classList.remove("d-none");
            this.previewFaviconFa.el.classList.add("d-none");
        } else {
            await this.keepLastPromise
                .add($.get(this.state.href))
                .then((content) => {
                    const parser = new window.DOMParser();
                    const doc = parser.parseFromString(content, "text/html");

                    // Get
                    const favicon = doc.querySelector("link[rel~='icon']");
                    const ogTitle = doc.querySelector("[property='og:title']");
                    const title = doc.querySelector("title");

                    // Set
                    if (favicon) {
                        this.previewFaviconImg.el.src = favicon.href;
                        this.previewFaviconImg.el.classList.remove("d-none");
                        this.previewFaviconFa.el.classList.add("d-none");
                    }
                    if (ogTitle || title) {
                        this.urlLink.el.textContent = ogTitle
                            ? ogTitle.getAttribute("content")
                            : title.text.trim();
                    }
                    this.fullUrl.el.classList.remove("d-none");
                    this.fullUrl.el.classList.add("o_we_webkit_box");
                })
                .catch((error) => {
                    // HTML error codes should not prevent to edit the links, so we
                    // only check for proper instances of Error.
                    if (error instanceof Error) {
                        return Promise.reject(error);
                    }
                });
        }
    }
}
