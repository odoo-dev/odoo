/** @odoo-module **/
import { renderToElement } from "@web/core/utils/render";

export class NavbarMorphingController {
    static instance = null;

    static get(env, parentEl) {
        if (!this.instance) {
            this.instance = new NavbarMorphingController(env, parentEl);
        }
        return this.instance;
    }

    constructor(env, parentEl) {
        this.env = env;
        this.parentEl = parentEl;
        // Navigation stack: each entry is { innerHTML, isMegaMenu, label }
        this.stack = [];
        this.currentMenu = null;
        this.currentLabel = null;
        this.currentSourceHTML = null;
        this.currentIsMegaMenu = false;
        this.anchorTop = 0;
        this.anchorLeft = 0;
        // Click-lock state: when true, hover-away events don't dismiss the panel.
        this.clickLocked = false;
        this._backdrop = null;
        this.wrapper = this._createContainer();
    }

    _createContainer() {
        const wrapper = renderToElement("website.navbar_morphing.wrapper");
        this.parentEl?.appendChild(wrapper);
        return wrapper;
    }

    /**
     * Enter click-locked mode: hover-away events are ignored until the user
     * clicks outside the panel. A transparent backdrop is inserted behind the
     * container to capture that outside click and dismiss.
     */
    lockClick() {
        if (this.clickLocked) return;
        this.clickLocked = true;
        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:1049';
        backdrop.addEventListener('click', () => {
            this._removeBackdrop();
            this.hide();
        }, { once: true });
        this.parentEl.appendChild(backdrop);
        this._backdrop = backdrop;
    }

    _removeBackdrop() {
        this.clickLocked = false;
        if (this._backdrop) {
            this._backdrop.remove();
            this._backdrop = null;
        }
    }

    /**
     * Called by the service when hovering a top-level nav item.
     * Always resets the stack.
     */
    morphTo(anchor, sourceMenu) {
        this._removeBackdrop();
        this.stack = [];
        this.currentLabel = null;
        const rect = anchor.getBoundingClientRect();
        this.anchorTop = rect.bottom;
        this.anchorLeft = rect.left + (rect.width / 2);
        this._renderMenu(sourceMenu.innerHTML, sourceMenu.classList.contains('o_mega_menu'), null);
    }

    /**
     * Drill into a nested submenu. Saves the current level onto the stack.
     * @param {HTMLElement} subMenuEl - the .dropdown-menu element to drill into
     * @param {string} label         - the submenu's display name (shown in back header)
     */
    drillIn(subMenuEl, label) {
        this.stack.push({
            innerHTML: this.currentSourceHTML,
            isMegaMenu: this.currentIsMegaMenu,
            label: this.currentLabel,
        });
        this.currentLabel = label;
        this._renderMenu(subMenuEl.innerHTML, subMenuEl.classList.contains('o_mega_menu'), label);
    }

    /**
     * Navigate back to the previous level.
     */
    drillBack() {
        const prev = this.stack.pop();
        if (!prev) return;
        this.currentLabel = prev.label;
        this._renderMenu(prev.innerHTML, prev.isMegaMenu, prev.label);
    }

    /**
     * Core rendering method. Fades in a new content wrapper and fades out the old one.
     * @param {string}  innerHTML  - raw HTML to inject as the menu content
     * @param {boolean} isMegaMenu - whether to apply mega-menu styling
     * @param {string|null} label  - if non-null, a back header is prepended with this title
     */
    _renderMenu(innerHTML, isMegaMenu, label) {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
        }

        const newMenu = renderToElement("website.navbar_morphing.submenu");
        const oldMenu = this.currentMenu;
        const isOpening = !oldMenu;

        // Store current source so drillIn can save it later
        this.currentSourceHTML = innerHTML;
        this.currentIsMegaMenu = isMegaMenu;

        this.wrapper.classList.toggle('o_navbar_morphing_container_animated', !isOpening);
        newMenu.style.opacity = "0";

        this.currentMenu = newMenu;

        setTimeout(() => {
            // Prepend back header when we're inside a nested level
            if (label !== null) {
                const divider = renderToElement("website.navbar_morphing.submenu_divider");
                const header = renderToElement("website.navbar_morphing.submenu_back_header");
                header.querySelector('.o_navbar_morphing_back_title').textContent = label;
                newMenu.appendChild(header);
                newMenu.appendChild(divider);
            }
            newMenu.insertAdjacentHTML('beforeend', innerHTML);
            newMenu.classList.toggle('o_mega_menu', isMegaMenu);

            this.wrapper.appendChild(newMenu);
            this.recalculate(isOpening, newMenu);

            newMenu.style.opacity = "1";
            if (oldMenu) {
                oldMenu.style.opacity = "0";
                setTimeout(() => oldMenu.remove(), 100);
            }
        }, isOpening ? 0 : 50);
    }

    recalculate(isOpening, newMenu) {
        if (isOpening) {
            this.wrapper.style.width = 'auto';
            this.wrapper.style.height = 'auto';
        }
        this.wrapper.classList.remove('d-none');

        // Lock overflow while dimensions are transitioning so no scrollbars flash.
        this.wrapper.style.overflowY = 'hidden';
        clearTimeout(this._overflowRestoreTimer);

        const naturalWidth = newMenu.scrollWidth;
        // Cap height so the panel never extends past the bottom of the viewport.
        const naturalHeight = newMenu.scrollHeight;
        const maxHeight = window.innerHeight - this.anchorTop - 16;

        this.wrapper.style.width = `${naturalWidth}px`;
        this.wrapper.style.height = `${Math.min(naturalHeight, maxHeight)}px`;
        this.wrapper.style.setProperty("--NavBarMorphing-left", `${this.anchorLeft}px`);
        this.wrapper.style.setProperty("--NavBarMorphing-top", `${this.anchorTop}px`);

        // Once the transition settles, allow scrolling for viewport-clipped panels.
        // Timeout matches the longest CSS transition (height: 0.3s + small buffer).
        this._overflowRestoreTimer = setTimeout(() => {
            this.wrapper.style.overflowY = 'auto';
        }, 350);
    }

    hide() {
        this._removeBackdrop();
        clearTimeout(this._overflowRestoreTimer);
        this.closeTimer = setTimeout(() => {
            this.wrapper.classList.add('d-none');
            this.wrapper.style.overflowY = '';
            this.wrapper.style.width = '0px';
            this.wrapper.style.height = '0px';
            if (this.currentMenu) {
                this.currentMenu.remove();
            }
            this.currentMenu = null;
            this.stack = [];
            this.currentLabel = null;
        }, 100);
    }
}
