import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { isBrowserSafari } from "@web/core/browser/feature_detection";
import { rpc } from "@web/core/network/rpc";
import { KeepLast } from "@web/core/utils/concurrency";
import { renderToElement, renderToString } from "@web/core/utils/render";

import { markup } from "@odoo/owl";

class SearchbarForm extends Interaction {
    static selector = ".o_searchbar_form";
    dynamicContent = {
        ".search-query": {
            "t-on-input": this.onInput,
            "t-on-search": this.onSearch,
        },
        ".search-query, .dropdown-item": {
            "t-on-keydown": this.onKeyDown,
        },
        _root: {
            "t-on-focusout": this.onFocusOut,
            "t-on-mousedown": this.onMouseDown, // delegated to ".o_dropdown_menu .dropdown-item"
            "t-on-mouseup": this.onMouseUp, // delegated to ".o_dropdown_menu .dropdown-item"
        },
    };

    setup() {
        this.autocompleteMinWidth = 300;
        this.keepLast = new KeepLast();

        this.input = this.el.querySelector('.search-query');

        this.searchType = this.input.getAttribute('data-search-type');
        this.order = this.el.querySelector('.o_search_order_by').value;
        this.limit = parseInt(this.input.getAttribute('data-limit'));
        this.displayDescription = this.input.getAttribute('data-display-description');
        this.displayExtraLink = this.input.getAttribute('data-display-extra-link');
        this.displayDetail = this.input.getAttribute('data-display-detail');
        this.displayImage = this.input.getAttribute('data-display-image');
        this.wasEmpty = !this.input.value;

        // Make it easy for customization to disable fuzzy matching on specific searchboxes
        this.allowFuzzy = !this.input.getAttribute('data-no-fuzzy');
        if (this.limit) {
            this.input.setAttribute('autocomplete', 'off');
        }

        this.options = {
            'displayImage': this.displayImage,
            'displayDescription': this.displayDescription,
            'displayExtraLink': this.displayExtraLink,
            'displayDetail': this.displayDetail,
            'allowFuzzy': this.allowFuzzy,
        };

        this.form = this.el.querySelector('.o_search_order_by').closest('form');
        for (const field of this.form.querySelectorAll("input[type='hidden']")) {
            this.options[field.name] = field.value;
        }

        const action = this.form.getAttribute('action') || window.location.pathname + window.location.search;

        const [urlPath, urlParams] = action.split('?');
        if (urlParams) {
            for (const keyValue of urlParams.split('&')) {
                const [key, value] = keyValue.split('=');
                if (value && key !== 'search') {
                    // Decode URI parameters: revert + to space then decodeURIComponent.
                    this.options[decodeURIComponent(key.replace(/\+/g, '%20'))] = decodeURIComponent(value.replace(/\+/g, '%20'));
                }
            }
        }

        const pathParts = urlPath.split('/');
        for (const index in pathParts) {
            const value = decodeURIComponent(pathParts[index]);
            if (index > 0 && /-[0-9]+$/.test(value)) {
                this.options[decodeURIComponent(pathParts[index - 1])] = value;
            }
        }

        if (!this.allowFuzzy) {
            const newInput = document.createElement("input");
            newInput.setAttribute("type", "hidden");
            newInput.setAttribute("name", "noFuzzy");
            newInput.setAttribute("value", "true");
            this.input.appendChild(newInput);
        }

    }

    destroy() {
        this.render(null);
    }

    getFieldsNames() {
        return [
            'description',
            'detail',
            'detail_extra',
            'detail_strike',
            'extra_link',
            'name',
        ];
    }

    adjustToScrollingParent() {
        const bcr = this.el.getBoundingClientRect();
        this.menu.style.setProperty('position', 'fixed', 'important');
        this.menu.style.setProperty('top', `${bcr.bottom}px`, 'important');
        this.menu.style.setProperty('left', `${bcr.left}px`, 'important');
        this.menu.style.setProperty('max-width', `${bcr.width}px`, 'important');
        this.menu.style.setProperty('max-height', `${document.body.clientHeight - bcr.bottom - 16}px`, 'important');
    }

    async fetch() {
        const res = await rpc('/website/snippet/autocomplete', {
            'search_type': this.searchType,
            'term': this.input.value,
            'order': this.order,
            'limit': this.limit,
            'max_nb_chars': Math.round(Math.max(this.autocompleteMinWidth, parseInt(this.el.getBoundingClientRect().width)) * 0.22),
            'options': this.options,
        });
        const fieldNames = this.getFieldsNames();
        res.results.forEach(record => {
            for (const fieldName of fieldNames) {
                if (record[fieldName]) {
                    record[fieldName] = markup(record[fieldName]);
                }
            }
        });
        return res;
    }

    render(res) {
        console.log("render");
        if (this.scrollingParentEl) {
            this.scrollingParentEl.removeEventListener('scroll', this.menuScrollAndResizeHandler);
            window.removeEventListener('resize', this.menuScrollAndResizeHandler);
            delete this.scrollingParentEl;
            delete this.menuScrollAndResizeHandler;
        }

        let pageScrollHeight = null;
        const prevMenu = this.menu;
        if (res && this.limit) {
            const results = res['results'];
            let template = 'website.s_searchbar.autocomplete';
            const candidate = template + '.' + this.searchType;
            if (renderToString.app.getRawTemplate(candidate)) {
                template = candidate;
            }
            this.menu = renderToElement(template, {
                results: results,
                parts: res['parts'],
                hasMoreResults: results.length < res['results_count'],
                search: this.input.value,
                fuzzySearch: res['fuzzy_search'],
                widget: this,
            });
            this.menu.style.minWidth = this.autocompleteMinWidth;

            // Handle the case where the searchbar is in a mega menu by making
            // it position:fixed and forcing its size. Note: this could be the
            // default behavior or at least needed in more cases than the mega
            // menu only (all scrolling parents). But as a stable fix, it was
            // easier to fix that case only as a first step, especially since
            // this cannot generically work on all scrolling parent.
            const megaMenuEl = this.el.closest('.o_mega_menu');
            if (megaMenuEl) {
                const navbarEl = this.el.closest('.navbar');
                const navbarTogglerEl = navbarEl ? navbarEl.querySelector('.navbar-toggler') : null;
                if (navbarTogglerEl && navbarTogglerEl.clientWidth < 1) {
                    this.scrollingParentEl = megaMenuEl;
                    this.menuScrollAndResizeHandler = () => this.adaptToScrollingParent();
                    this.scrollingParentEl.addEventListener('scroll', this.menuScrollAndResizeHandler);
                    window.addEventListener('resize', this.menuScrollAndResizeHandler);

                    this.adaptToScrollingParent();
                }
            }

            pageScrollHeight = document.documentElement.scrollHeight;
            this.el.appendChild(this.menu);

            this.el.querySelector('button.extra_link')?.addEventListener('click', function (ev) {
                ev.preventDefault();
                window.location.href = ev.currentTarget.dataset['target'];
            });
            this.el.querySelector('.s_searchbar_fuzzy_submit')?.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.input.value = res['fuzzy_search'];
                this.form.submit();
            });
        }

        this.form.classList.toggle('dropdown', !!res);
        this.form.classList.toggle('show', !!res);
        if (prevMenu) {
            prevMenu.remove();
        }
        // Adjust the menu's position based on the scroll height.
        if (res && this.limit) {
            this.el.classList.remove("dropup");
            delete this.menu.dataset.bsPopper;
            if (document.documentElement.scrollHeight > pageScrollHeight) {
                // If the menu overflows below the page, we reduce its height.
                this.menu.style.maxHeight = "40vh";
                this.menu.style.overflowY = "auto";
                // We then recheck if the menu still overflows below the page.
                if (document.documentElement.scrollHeight > pageScrollHeight) {
                    // If the menu still overflows below the page after its height
                    // has been reduced, we position it above the input.
                    this.el.classList.add("dropup");
                    this.menu.dataset.bsPopper = "";
                }
            }
        }
    }

    onFocusOut() {
        if (this.linkHasFocus || this.el.contains(document.activeElement)) {
            return;
        }
        this.render();
    }

    onInput() {
        if (!this.limit) {
            return;
        }
        if (this.searchType === 'all' && !this.input.value.trim().length) {
            this.render();
        } else {
            this.keepLast.add(this.fetch()).then(this.render.bind(this));
        }
    }

    /**
     * @param {Event} ev
     */
    onSearch(ev) {
        if (this.input.value) { // actual search
            this.limit = 0; // prevent autocomplete
        } else { // clear button clicked
            this.render();
            ev.preventDefault();
        }
    }

    /**
     * @param {Event} ev
     */
    onKeyDown(ev) {
        switch (ev.key) {
            case "Escape":
                this.render();
                break;
            case "ArrowUp":
            case "ArrowDown":
                ev.preventDefault();
                if (this.menu) {
                    const focusableEls = [this.input, ...this.menu.querySelectorAll("a")];
                    const focusedEl = document.activeElement;
                    const currentIndex = focusableEls.indexOf(focusedEl) || 0;
                    const delta = ev.key === "ArrowUp" ? focusableEls.length - 1 : 1;
                    const nextIndex = (currentIndex + delta) % focusableEls.length;
                    const nextFocusedEl = focusableEls[nextIndex];
                    nextFocusedEl.focus();
                }
                break;
            case "Enter":
                this.limit = 0; // prevent autocomplete
                break;
        }
    }

    /**
     * @param {Event} ev
     */
    onMouseDown(ev) {
        const target = ev.currentTarget.closest(".o_dropdown_menu .dropdown-item");
        // On Safari, links and buttons are not focusable by default. We need
        // to get around that behavior to avoid _onFocusOut() from triggering
        // _render(), as this would prevent the click from working.
        if (!target || !isBrowserSafari) {
            return;
        }
        this.linkHasFocus = true;
    }

    /**
     * @param {Event} ev
     */
    onMouseUp(ev) {
        const target = ev.currentTarget.closest(".o_dropdown_menu .dropdown-item");
        // See comment in onMouseDown.
        if (!target || !isBrowserSafari) {
            return;
        }
        this.linkHasFocus = false;
    }

}

registry
    .category("website.active_elements")
    .add("website.searchbar_form", SearchbarForm);
