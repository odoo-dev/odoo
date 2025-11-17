/** @odoo-module **/

import Widget from 'web.Widget';
import {_t} from 'web.core';
import {DropPrevious} from 'web.concurrency';
import { ancestors } from '@web_editor/js/common/wysiwyg_utils';

const DocumentPopoverWidget = Widget.extend({
    template: 'wysiwyg.widgets.document.download.tooltip',

    /**
     * @constructor
     * @param {Element} target: target Element for which we display a popover
     * @param {Wysiwyg} [option.wysiwyg]: The wysiwyg editor
     */
    init(parent, target, options) {
        this._super(...arguments);
        this.options = options;
        this.target = target;
        this.$target = $(target);
        this.container = this.options.container || this.target.ownerDocument.body;
        this.href = this.$target.attr('href'); // for template
        this._dp = new DropPrevious();
    },
    /**
     * @override
     * @todo replace this hack in master. This is required to not listen to the
     * DOM mutation of adding this widget inside the DOM (which is probably not
     * even needed in the first place).
     */
    _widgetRenderAndInsert(insertCallback, ...rest) {
        const patchedInsertCallback = (...args) => {
            this.options.wysiwyg.odooEditor.observerUnactive();
            const res = insertCallback(...args);
            this.options.wysiwyg.odooEditor.observerActive();
            return res;
        };
        return this._super(patchedInsertCallback, ...rest);
    },
    /**
     *
     * @override
     */
    start() {
        this.$urlLink = this.$('.o_we_url_link');
        this.$previewFaviconImg = this.$('.o_we_preview_favicon img');
        this.$previewFaviconFa = this.$('.o_we_preview_favicon .fa');
        this.$fullUrl = this.$('.o_we_full_url');

        // Init popover -> it is moved out of the link (and the savable area)
        const tooltips = [];
        let popoverShown = true;
        this.options.wysiwyg.odooEditor.observerUnactive();
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
            this._loadAsyncLinkPreview();
            popoverShown = true;
        })
        .on('hide.bs.popover.link_popover', () => {
            popoverShown = false;
        })
        .on('hidden.bs.popover.link_popover', () => {
            for (const tooltip of tooltips) {
                tooltip.hide();
            }
        })
        .on('inserted.bs.popover.link_popover', () => {
            const popover = Popover.getInstance(this.target);
            popover.tip.classList.add('o_edit_menu_popover');
        })
        .popover('show');
        // Init popover inner tooltips (note that probably no need of observer
        // unactive during this since out of the editable area but
        // `this.container` is customizable so, not guaranteed). TODO improve.
        this.$('[data-bs-toggle="tooltip"]').tooltip({
            delay: 0,
            placement: 'bottom',
            container: this.container,
        });
        for (const el of this.$('[data-bs-toggle="tooltip"]').toArray()) {
            tooltips.push(Tooltip.getOrCreateInstance(el));
        }
        this.options.wysiwyg.odooEditor.observerActive();

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
        };
        $(document).on('mouseup.link_popover', onClickDocument);
        if (document !== this.options.wysiwyg.odooEditor.document) {
            $(this.options.wysiwyg.odooEditor.document).on('mouseup.link_popover', onClickDocument);
        }

        // Update popover's content and position upon changes
        // on the link's label or href.
        this._observer = new MutationObserver(records => {
            if (!popoverShown) {
                return;
            }
            if (records.some(record => record.type === 'attributes')) {
                this._loadAsyncLinkPreview();
            }
            this.$target.popover('update');
        });
        this._observer.observe(this.target, {
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['href'],
        });

        return this._super(...arguments);
    },
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
        $(this.options.wysiwyg.odooEditor.document).off('.link_popover');
        this.$target.popover('dispose');
        this._observer.disconnect();
        return this._super(...arguments);
    },

    /**
     *  Hide the popover.
     */
    hide() {
        this.$target.popover('hide');
    },

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
        } catch (_e) {
            // Invalid URL, might happen with editor unsuported protocol. eg type
            // `geo:37.786971,-122.399677`, become `http://geo:37.786971,-122.399677`
            this.displayNotification({
                type: 'danger',
                message: _t("This URL is invalid. Preview couldn't be updated."),
            });
            return;
        }

        this._resetPreview(url);

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
    },
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
    },

});

DocumentPopoverWidget.createFor = async function (parent, targetEl, options) {
    const noLinkPopoverClass = ".o_no_link_popover, .carousel-control-prev, .carousel-control-next, .dropdown-toggle";
    // Target might already have a popover, eg cart icon in navbar
    const alreadyPopover = $(targetEl).data('bs.popover');
    if (alreadyPopover || $(targetEl).is(noLinkPopoverClass) || !!$(targetEl).parents(noLinkPopoverClass).length) {
        return null;
    }
    const popoverWidget = new this(parent, targetEl, options);
    await popoverWidget.appendTo(targetEl);
    return popoverWidget;
};

export default DocumentPopoverWidget;
