/** @odoo-module **/

import { useAutofocus, useService } from '@web/core/utils/hooks';
import { Dialog } from '@web/core/dialog/dialog';
import { _t } from "@web/core/l10n/translation";
import { Switch } from '@website/components/switch/switch';
import wUtils from '@website/js/utils';

const { useRef, useState, Component, onWillStart, onMounted } = owl;

const NO_OP = () => {};

export class WebsiteDialog extends Component {
    setup() {
        this.state = useState({
            disabled: false,
        });
    }
    /**
     * Disables the buttons of the dialog when a click is made.
     * If a handler is provided, await for its call.
     * If the prop closeOnClick is true, close the dialog.
     * Otherwise, restore the button.
     *
     * @param handler {function|void} The handler to protect.
     * @returns {function(): Promise} handler called when a click is made.
     */
    protectedClick(handler) {
        return async () => {
            if (this.state.disabled) {
                return;
            }
            this.state.disabled = true;
            if (handler) {
                await handler();
            }
            if (this.props.closeOnClick) {
                return this.props.close();
            }
            this.state.disabled = false;
        }
    }

    get contentClasses() {
        const websiteDialogClass = 'o_website_dialog';
        if (this.props.contentClass) {
            return `${websiteDialogClass} ${this.props.contentClass}`;
        }
        return websiteDialogClass;
    }
}
WebsiteDialog.components = { Dialog };
WebsiteDialog.props = {
    ...Dialog.props,
    primaryTitle: { type: String, optional: true },
    primaryClick: { type: Function, optional: true },
    secondaryTitle: { type: String, optional: true },
    secondaryClick: { type: Function, optional: true },
    showSecondaryButton: { type: Boolean, optional: true },
    close: { type: Function, optional: true },
    closeOnClick: { type: Boolean, optional: true },
    body: { type: String, optional: true },
    slots: { type: Object, optional: true },
    showFooter: { type: Boolean, optional: true },
};
WebsiteDialog.defaultProps = {
    ...Dialog.defaultProps,
    title: _t("Confirmation"),
    showFooter: true,
    primaryTitle: _t("Ok"),
    secondaryTitle: _t("Cancel"),
    showSecondaryButton: true,
    size: "md",
    closeOnClick: true,
    close: NO_OP,
};
WebsiteDialog.template = "website.WebsiteDialog";

export class AddPageTemplatePreview extends Component {
    setup() {
        super.setup();
        this.iframeRef = useRef("iframe");
        this.previewRef = useRef("preview");
        this.holderRef = useRef("holder");

        onMounted(async () => {
            const holderEl = this.holderRef.el;
            holderEl.classList.add("o_loading");
            const previewEl = this.previewRef.el;
            const iframeEl = this.iframeRef.el;
            // Firefox replaces the built content with about:blank.
            const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
            if (isFirefox) {
                // Make sure empty preview iframe is loaded.
                // This event is never triggered on Chrome.
                await new Promise(resolve => {
                    iframeEl.contentDocument.body.onload = resolve;
                });
            }
            // Apply styles.
            for (const cssLinkEl of await this.props.getCssLinkEls()) {
                const preloadLinkEl = document.createElement("link");
                preloadLinkEl.setAttribute("rel", "preload");
                preloadLinkEl.setAttribute("href", cssLinkEl.getAttribute("href"));
                preloadLinkEl.setAttribute("as", "style");
                iframeEl.contentDocument.head.appendChild(preloadLinkEl);
                iframeEl.contentDocument.head.appendChild(cssLinkEl.cloneNode(true));
            }
            // Adjust styles.
            const styleEl = document.createElement("style");
            // Does not work with fit-content in Firefox.
            const carouselHeight = isFirefox ? '450px' : 'fit-content';
            // Prevent successive resizes.
            const fullHeight = getComputedStyle(document.querySelector(".o_action_manager")).height;
            const halfHeight = `${Math.round(parseInt(fullHeight) / 2)}px`;
            const css = `
                #wrapwrap {
                    overflow: hidden;
                    padding-right: 0px;
                    padding-left: 0px;
                }
                section[data-snippet="s_carousel"],
                section[data-snippet="s_quotes_carousel"] {
                    height: ${carouselHeight} !important;
                }
                section.o_half_screen_height {
                    min-height: ${halfHeight} !important;
                }
                section.o_full_screen_height {
                    min-height: ${fullHeight} !important;
                }
                section[data-snippet="s_three_columns"] .figure-img[style*="height:50vh"] {
                    ${" " || "In Travel theme."}
                    height: 170px !important;
                }
                .o_we_shape {
                    ${" " || "Avoid the zoom's missing pixel."}
                    height: 101%;
                }
            `;
            const cssText = document.createTextNode(css);
            styleEl.appendChild(cssText);
            iframeEl.contentDocument.head.appendChild(styleEl);
            // Put blocks.
            // To preserve styles, the whole #wrapwrap > main > #wrap
            // nesting must be reproduced.
            const mainEl = document.createElement("main");
            const wrapwrapEl = document.createElement("div");
            wrapwrapEl.id = "wrapwrap";
            wrapwrapEl.appendChild(mainEl);
            iframeEl.contentDocument.body.appendChild(wrapwrapEl);
            const templateDocument = new DOMParser().parseFromString(this.props.template.template, "text/html");
            const wrapEl = templateDocument.getElementById("wrap");
            // Clean-up data-oe- attributes.
            for (const sectionEl of wrapEl.querySelectorAll("[data-oe-model]")) {
                for (const attributeName of sectionEl.getAttributeNames()) {
                    if (attributeName.startsWith("data-oe-")) {
                        sectionEl.removeAttribute(attributeName);
                    }
                }
            }
            mainEl.appendChild(wrapEl);
            // Make image loading eager.
            const lazyLoadedImgEls = wrapEl.querySelectorAll("img[loading=lazy]");
            for (const imgEl of lazyLoadedImgEls) {
                imgEl.setAttribute("loading", "eager");
            }
            mainEl.appendChild(wrapEl);
            await wUtils.onceAllImagesLoaded($(wrapEl));
            // Restore image lazy loading.
            for (const imgEl of lazyLoadedImgEls) {
                imgEl.setAttribute("loading", "lazy");
            }
            // Wait for fonts.
            await iframeEl.contentDocument.fonts.ready;
            holderEl.classList.remove("o_loading");
            const adjustHeight = () => {
                if (!this.previewRef.el) {
                    // Stop ajusting height when preview is removed.
                    return;
                }
                const outerWidth = parseInt(window.getComputedStyle(previewEl).width);
                const innerHeight = wrapEl.getBoundingClientRect().height;
                const innerWidth = wrapEl.getBoundingClientRect().width;
                const ratio = outerWidth / innerWidth;
                iframeEl.height = Math.round(innerHeight);
                previewEl.style.setProperty("height", `${Math.round(innerHeight * ratio)}px`);
                // Sometimes the final height is not ready yet.
                setTimeout(adjustHeight, 50);
                holderEl.classList.add("o_ready");
            };
            adjustHeight();
        });
    }

    select() {
        if (this.holderRef.el.classList.contains("o_loading")) {
            return;
        }
        const wrapEl = this.iframeRef.el.contentDocument.getElementById("wrap").cloneNode(true);
        for (const previewEl of wrapEl.querySelectorAll(".o_new_page_snippet_preview")) {
            previewEl.remove();
        }
        this.props.addPage(wrapEl.innerHTML);
    }
}
AddPageTemplatePreview.props = {
    addPage: Function,
    getCssLinkEls: Function,
    template: Object,
    animationDelay: Number,
    firstRow: {
        type: Boolean,
        optional: true,
    },
};
AddPageTemplatePreview.template = "website.AddPageTemplatePreview";

export class AddPageTemplatePreviews extends Component {
    setup() {
        super.setup();
    }

    get columns() {
        const result = [[], [], []];
        let currentColumnIndex = 0;
        for (const template of this.props.templates) {
            result[currentColumnIndex].push(template);
            currentColumnIndex = (currentColumnIndex + 1) % result.length;
        }
        return result;
    }
}
AddPageTemplatePreviews.props = {
    name: String,
    addPage: Function,
    getCssLinkEls: Function,
    templates: {
        type: Array,
        element: Object,
    },
};
AddPageTemplatePreviews.components = {
    AddPageTemplatePreview,
};
AddPageTemplatePreviews.template = "website.AddPageTemplatePreviews";

export class AddPageTemplates extends Component {
    setup() {
        super.setup();
        this.tabsRef = useRef("tabs");
        this.panesRef = useRef("panes");
        this.rpc = useService('rpc');

        this.state = useState({
            loading: true,
            pages: [],
        });
        this.pages = undefined;

        onWillStart(() => {
            this.preparePages().then(pages => {
                this.state.pages = pages;
                this.state.loading = false;
            });
        });
    }

    async preparePages() {
        // Forces the correct website if needed before fetching the templates.
        // Displaying the correct images in the previews also relies on the
        // website id having been forced.
        await this.props.getCssLinkEls();
        if (this.pages) {
            return this.pages;
        }
        const newPageTemplates = await this.rpc("/website/new_page_templates");
        const pages = [];
        for (const template of newPageTemplates) {
            template.addPage = this.props.addPage;
            template.getCssLinkEls = this.props.getCssLinkEls;
            pages.push({
                Component: AddPageTemplatePreviews,
                title: template.title,
                props: template,
                id: `${template.id}`,
            });
        }
        this.pages = pages;
        return pages;
    }

    onTabClick(id) {
        const activeTabEl = this.tabsRef.el.querySelector(".active");
        const activePaneEl = this.panesRef.el.querySelector(".active");
        activeTabEl?.classList?.remove("active");
        activePaneEl?.classList?.remove("active");
        const tabEl = this.tabsRef.el.querySelector(`[data-id=${id}]`);
        const paneEl = this.panesRef.el.querySelector(`[data-id=${id}]`);
        tabEl.classList.add("active");
        paneEl.classList.add("active");
        this.props.onTemplatePageChanged(tabEl.textContent);
    }
}
AddPageTemplates.props = {
    addPage: Function,
    getCssLinkEls: Function,
    onTemplatePageChanged: Function,
};
AddPageTemplates.components = {
    AddPageTemplatePreviews,
};
AddPageTemplates.template = "website.AddPageTemplates";

export class AddPageDialog extends Component {
    setup() {
        super.setup();
        useAutofocus();

        this.title = _t("New Page");
        this.primaryTitle = _t("Create");
        this.switchLabel = _t("Add to menu");
        this.website = useService('website');
        this.orm = useService('orm');
        this.rpc = useService('rpc');
        this.http = useService('http');
        this.action = useService('action');
        this.userService = useService('user');

        this.state = useState({
            addMenu: true,
            name: '',
        });
        this.cssLinkEls = undefined;
        if (this.props.ready) {
            onMounted(() => this.props.ready());
        }
    }

    onChangeAddMenu(value) {
        this.state.addMenu = value;
    }

    onTemplatePageChanged(name) {
        if (this.state && !this.state.name || this.state.name === this.lastName) {
            this.state.name = name;
            this.lastName = name;
        }
    }

    async addPage(sectionsArch) {
        const params = {'add_menu': this.state.addMenu || '', csrf_token: odoo.csrf_token};
        if (sectionsArch) {
            params.sections_arch = sectionsArch;
        }
        // Remove any leading slash.
        const pageName = this.state.name.replace(/^\/*/, "");
        const url = `/website/add/${encodeURIComponent(pageName)}`;
        params['website_id'] = this.props.websiteId;
        const data = await this.http.post(url, params);
        if (data.view_id) {
            this.action.doAction({
                'res_model': 'ir.ui.view',
                'res_id': data.view_id,
                'views': [[false, 'form']],
                'type': 'ir.actions.act_window',
                'view_mode': 'form',
            });
        } else {
            this.website.goToWebsite({path: data.url, edition: true, websiteId: this.props.websiteId});
        }
        this.props.onAddPage(this.state);
        this.props.close();
    }

    getCssLinkEls() {
        if (! this.cssLinkEls) {
            this.cssLinkEls = new Promise(async resolve => {
                let contentDocument;
                // Already in DOM ?
                const pageIframeEl = document.querySelector("iframe.o_iframe");
                if (pageIframeEl?.getAttribute("is-ready") === "true") {
                    contentDocument = pageIframeEl.contentDocument;
                }
                if (!contentDocument) {
                    // Fetch page.
                    const html = await this.http.get(`/website/force/${this.props.websiteId}?path=/`, "text");
                    contentDocument = new DOMParser().parseFromString(html, "text/html");
                }
                resolve(contentDocument.head.querySelectorAll("link[type='text/css']"));
            });
        }
        return this.cssLinkEls;
    }
}
AddPageDialog.props = {
    close: Function,
    onAddPage: {
        type: Function,
        optional: true,
    },
    ready: {
        type: Function,
        optional: true,
    },
    websiteId: {
        type: Number,
    },
};
AddPageDialog.defaultProps = {
    onAddPage: NO_OP,
};
AddPageDialog.components = {
    Switch,
    WebsiteDialog,
    AddPageTemplates,
    AddPageTemplatePreviews,
};
AddPageDialog.template = "website.AddPageDialog";
