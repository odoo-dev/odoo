/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { ancestors } from '@web_editor/js/common/wysiwyg_utils';

class DropPrevious {
    /**
     * Registers a new promise and rejects the previous one
     *
     * @param {Promise} promise the new promise
     * @returns {Promise}
     */
    add(promise) {
        if (this.currentDef) {
            this.currentDef.reject();
        }
        let rejection;
        let res = new Promise((resolve, reject) => {
            rejection = reject;
            promise.then(resolve).catch((reason) => {
                reject(reason);
            });
        });

        this.currentDef = res;
        this.currentDef.reject = rejection;
        return res;
    }
}

export class LinkPopoverWidget {
    static createFor(params) {
        const noLinkPopoverClass = ".o_no_link_popover, .carousel-control-prev, .carousel-control-next, .dropdown-toggle";
        // Target might already have a popover, eg cart icon in navbar
        const alreadyPopover = $(params.target).data('bs.popover');
        if (alreadyPopover || $(params.target).is(noLinkPopoverClass) || !!$(params.target).parents(noLinkPopoverClass).length) {
            return null;
        }
        const popoverWidget = new this(params);
        params.wysiwyg?.odooEditor.observerUnactive('LinkPopoverWidget');
        popoverWidget.start();
        params.wysiwyg?.odooEditor.observerActive('LinkPopoverWidget');
        return popoverWidget;
    };

    template = `
        <div class="d-flex">
            <span class="me-2 o_we_preview_favicon"><i class="fa fa-globe"></i><img class="align-baseline d-none"></img></span>
            <div class="w-100">
                <div class="d-flex">
                    <a href="#" target="_blank" class="o_we_url_link fw-bold flex-grow-1 text-truncate" title="Open in a new tab"></a>
                    <a href="#" class="mx-1 o_we_copy_link text-dark" data-bs-toggle="tooltip" data-bs-placement="top" title="Copy Link">
                        <i class="fa fa-clone"></i>
                    </a>
                    <a href="#" class="mx-1 o_we_edit_link text-dark" data-bs-toggle="tooltip" data-bs-placement="top" title="Edit Link">
                        <i class="fa fa-edit"></i>
                    </a>
                    <a href="#" class="ms-1 o_we_remove_link text-dark" data-bs-toggle="tooltip" data-bs-placement="top" title="Remove Link">
                        <i class="fa fa-chain-broken"></i>
                    </a>
                </div>
                <a href="#" target="_blank" class="o_we_full_url mt-1 text-muted d-none" title="Open in a new tab"></a>
            </div>
        </div>
    `;

    constructor(params) {
        const template = document.createElement('template');
        template.innerHTML = this.template;
        this.el = template.content.firstElementChild;
        this.$el = $(this.el);
        this.$ = this.$el.find.bind(this.$el);

        this.wysiwyg = params.wysiwyg;
        this.target = params.target;
        this.notify = params.notify;
        this.$target = $(params.target);
        this.container = params.container || this.target.ownerDocument.body;
        this.href = this.$target.attr('href'); // for template
        this._dp = new DropPrevious();
    }

    /**
     *
     * @override
     */
    start() {
        this.$urlLink = this.$('.o_we_url_link');
        this.$previewFaviconImg = this.$('.o_we_preview_favicon img');
        this.$previewFaviconFa = this.$('.o_we_preview_favicon .fa');
        this.$copyLink = this.$('.o_we_copy_link');
        this.$fullUrl = this.$('.o_we_full_url');

        // Use the right ClipboardJS with respect to the prototype of this.el
        // since, starting with Firefox 109, a widget element prototype that is
        // adopted by an iframe will not be instanceof its original constructor.
        // See: https://github.com/webcompat/web-bugs/issues/118350
        const ClipboardJS =
            this.el instanceof HTMLElement
                ? window.ClipboardJS
                : this.el.ownerDocument.defaultView.ClipboardJS;
        this.$urlLink.attr('href', this.href);
        this.$fullUrl.attr('href', this.href);
        this.$(`.o_we_edit_link`).on('click', this._onEditLinkClick.bind(this));
        this.$(`.o_we_remove_link`).on('click', this._onRemoveLinkClick.bind(this));

        // Copy onclick handler
        // ClipboardJS uses "instanceof" to verify the elements passed to its
        // constructor. Unfortunately, when the element is within an iframe,
        // instanceof is not behaving the same across all browsers.
        const containerWindow = this.container.ownerDocument.defaultView;
        let _ClipboardJS = ClipboardJS;
        if (this.$copyLink[0] instanceof containerWindow.HTMLElement) {
            _ClipboardJS = containerWindow.ClipboardJS;
        }
        const clipboard = new _ClipboardJS(
            this.$copyLink[0],
            {text: () => this.target.href} // Absolute href
        );
        clipboard.on('success', () => {
            this.$copyLink.tooltip('hide');
            this.notify({
                type: 'success',
                message: _t("Link copied to clipboard."),
            });
            this.popover.hide();
        });

        // init tooltips & popovers
        this.$('[data-bs-toggle="tooltip"]').tooltip({
            delay: 0,
            placement: 'bottom',
            container: this.container,
        });
        const tooltips = [];
        for (const el of this.$('[data-bs-toggle="tooltip"]').toArray()) {
            tooltips.push(Tooltip.getOrCreateInstance(el));
        }
        let popoverShown = true;
        this.$target.popover({
            html: true,
            content: this.$el,
            placement: 'bottom',
            // We need the popover to:
            // 1. Open when the link is clicked or double clicked
            // 2. Remain open when the link is clicked again (which `trigger: 'click'` is not doing)
            // 3. Remain open when the popover content is clicked..
            // 4. ..except if it the click was on a button of the popover content
            // 5. Close when the user click somewhere on the page (not being the link or the popover content)
            trigger: 'manual',
            boundary: 'viewport',
            container: this.container,
        })
        .on('show.bs.popover.link_popover', () => {
            this.wysiwyg.odooEditor.observerUnactive('show.bs.popover');
            this._loadAsyncLinkPreview();
            popoverShown = true;
        })
        .on('inserted.bs.popover', () => {
            this.wysiwyg.odooEditor.observerActive('show.bs.popover');
        })
        .on('hide.bs.popover.link_popover', () => {
            this.wysiwyg.odooEditor.observerUnactive('hide.bs.popover');
            popoverShown = false;
        })
        .on('hidden.bs.popover.link_popover', () => {
            this.wysiwyg.odooEditor.observerActive('hide.bs.popover');
            for (const tooltip of tooltips) {
                tooltip.hide();
            }
        })
        .on('inserted.bs.popover.link_popover', () => {
            const popover = Popover.getInstance(this.target);
            popover.tip.classList.add('o_edit_menu_popover');
        })
        .popover('show');


        this.popover = Popover.getInstance(this.target);
        this.$target.on('mousedown.link_popover', (e) => {
            if (!popoverShown) {
                this.$target.popover('show');
            }
        });
        this.$target.on('href_changed.link_popover', (e) => {
            // Do not change shown/hidden state.
            if (popoverShown) {
                this._loadAsyncLinkPreview();
            }
        });
        const onClickDocument = (e) => {
            if (popoverShown) {
                const hierarchy = [e.target, ...ancestors(e.target)];
                if (
                    !(
                        hierarchy.includes(this.$target[0]) ||
                        (hierarchy.includes(this.$el[0]) &&
                            !hierarchy.some(x => x.tagName && x.tagName === 'A' && (x === this.$urlLink[0] || x === this.$fullUrl[0])))
                    )
                ) {
                    // Note: For buttons of the popover, their listeners should
                    // handle the hide themselves to avoid race conditions.
                    this.popover.hide();
                }
            }
        }
        $(document).on('mouseup.link_popover', onClickDocument);
        if (document !== this.wysiwyg.odooEditor.document) {
            $(this.wysiwyg.odooEditor.document).on('mouseup.link_popover', onClickDocument);
        }
    }
    /**
     *
     * @override
     */
    destroy() {
        // FIXME those are never destroyed, so this could be a cause of memory
        // leak. However, it is only one leak per click on a link during edit
        // mode so this should not be a huge problem.
        this.$target.off('.link_popover');
        $(document).off('.link_popover');
        $(this.wysiwyg.odooEditor.document).off('.link_popover');
        this.$target.popover('dispose');
    }

    /**
     *  Hide the popover.
     */
    hide() {
        this.$target.popover('hide');
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Fetches and gets the link preview data (title, description..).
     * For external URL, only the favicon will be loaded.
     *
     * @private
     */
    async _loadAsyncLinkPreview() {
        let url;
        if (this.target.href === '') {
            this._resetPreview('');
            this.$previewFaviconFa.removeClass('fa-globe').addClass('fa-question-circle-o');
            return;
        }
        try {
            url = new URL(this.target.href); // relative to absolute
        } catch {
            // Invalid URL, might happen with editor unsuported protocol. eg type
            // `geo:37.786971,-122.399677`, become `http://geo:37.786971,-122.399677`
            this.notify({
                type: 'danger',
                message: _t("This URL is invalid. Preview couldn't be updated."),
            });
            return;
        }

        this._resetPreview(url);
        const protocol = url.protocol;
        if (!protocol.startsWith('http')) {
            const faMap = {'mailto:': 'fa-envelope-o', 'tel:': 'fa-phone'};
            const icon = faMap[protocol];
            if (icon) {
                this.$previewFaviconFa.toggleClass(`fa-globe ${icon}`);
            }
        } else if (window.location.hostname !== url.hostname) {
            // Preview pages from current website only. External website will
            // most of the time raise a CORS error. To avoid that error, we
            // would need to fetch the page through the server (s2s), involving
            // enduser fetching problematic pages such as illicit content.
            this.$previewFaviconImg.attr({
                'src': `https://www.google.com/s2/favicons?sz=16&domain=${encodeURIComponent(url)}`
            }).removeClass('d-none');
            this.$previewFaviconFa.addClass('d-none');
        } else {
            await this._dp.add($.get(this.target.href)).then(content => {
                const parser = new window.DOMParser();
                const doc = parser.parseFromString(content, "text/html");

                // Get
                const favicon = doc.querySelector("link[rel~='icon']");
                const ogTitle = doc.querySelector("[property='og:title']");
                const title = doc.querySelector("title");

                // Set
                if (favicon) {
                    this.$previewFaviconImg.attr({'src': favicon.href}).removeClass('d-none');
                    this.$previewFaviconFa.addClass('d-none');
                }
                if (ogTitle || title) {
                    this.$urlLink.text(ogTitle ? ogTitle.getAttribute('content') : title.text.trim());
                }
                this.$fullUrl.removeClass('d-none').addClass('o_we_webkit_box');
                this.$target.popover('update');
            });
        }
    }
    /**
     * Resets the preview elements visibility. Particularly useful when changing
     * the link url from an internal to an external one and vice versa.
     *
     * @private
     * @param {string} url
     */
    _resetPreview(url) {
        this.$previewFaviconImg.addClass('d-none');
        this.$previewFaviconFa.removeClass('d-none fa-question-circle-o fa-envelope-o fa-phone').addClass('fa-globe');
        this.$urlLink.add(this.$fullUrl).text(url || _t('No URL specified')).attr('href', url || null);
        this.$fullUrl.addClass('d-none').removeClass('o_we_webkit_box');
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Opens the Link Dialog.
     *
     * TODO The editor instance should be reached a proper way
     *
     * @private
     * @param {Event} ev
     */
    _onEditLinkClick(ev) {
        ev.preventDefault();
        this.wysiwyg.toggleLinkTools({
            forceOpen: true,
            link: this.$target[0],
        });
        ev.stopImmediatePropagation();
        this.popover.hide();
    }
    /**
     * Removes the link/anchor.
     *
     * @private
     * @param {Event} ev
     */
    _onRemoveLinkClick(ev) {
        ev.preventDefault();
        this.wysiwyg.removeLink();
        ev.stopImmediatePropagation();
        this.popover.hide();
    }
}
