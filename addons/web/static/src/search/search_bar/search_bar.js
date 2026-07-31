import { useAutofocus, useBus, useService } from "@web/core/utils/hooks";
import { DomainSelectorDialog } from "@web/core/domain_selector_dialog/domain_selector_dialog";
import { _t } from "@web/core/l10n/translation";
import { SearchBarMenu } from "../search_bar_menu/search_bar_menu";
import { Component, plugin, proxy, signal, t, useListener, useProps } from "@odoo/owl";
import { useLayoutEffect } from "@web/owl2/utils";
import { OfflinePlugin } from "@web/core/offline/offline_plugin";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { hasTouch } from "@web/core/browser/feature_detection";
import { useNavigation } from "@web/core/navigation/navigation";
import { throttleForAnimation } from "@web/core/utils/timing";

const FACET_GAP = 4; // px, matches the `gap-1` class on the facet row

export class SearchBar extends Component {
    static template = "web.SearchBar";
    static components = {
        SearchBarMenu,
    };
    props = useProps({
        autofocus: t.boolean().optional(true),
        slots: t
            .object({
                default: t.any().optional(),
                "search-bar-additional-menu": t.any().optional(),
            })
            .optional(),
        toggler: t.object().optional(),
    });
    root = signal.ref();
    facetContainerRef = signal.ref();
    inputRef = signal.ref();

    setup() {
        this.dialogService = useService("dialog");
        this.offlinePlugin = plugin(OfflinePlugin);
        this.ui = useService("ui");

        this.visibilityState = proxy(this.props.toggler?.state || { showSearchBar: true });

        this.state = proxy({
            visibleFacetCount: 0,
        });

        // Data handed off to SearchBarMenu when it opens (which query to seed it with).
        this.handoff = { seedQuery: "" };

        this.dropdownState = useDropdownState();

        this.setupFacetNavigation();

        if (!(this.env.config.disableSearchBarAutofocus || !this.props.autofocus)) {
            // only force the focus on touch devices on small screens
            useAutofocus({ ref: this.inputRef, mobile: this.ui.isSmall });
        }

        this.popoverWillCloseOnClickAway = (target) => {
            const inputEl = this.inputRef();
            return !(inputEl && (inputEl === target || inputEl.contains(target)));
        };

        useBus(this.env.searchModel, "focus-search", () => {
            this.inputRef().focus();
        });

        useBus(this.env.searchModel, "update", () => {
            this.render();
            this.adjustVisibleFacets();
        });

        // While the merged popover is open, the compact input is only a visual
        // placeholder: typing/focus happens in the popover's own input instead.
        useLayoutEffect(
            () => {
                const inputEl = this.inputRef();
                if (!inputEl) {
                    return;
                }
                if (this.dropdownState.isOpen) {
                    inputEl.value = "";
                    inputEl.setAttribute("tabindex", "-1");
                } else {
                    inputEl.removeAttribute("tabindex");
                }
            },
            () => [this.dropdownState.isOpen]
        );

        useLayoutEffect(
            () => this.adjustVisibleFacets(),
            () => [this.env.searchModel.facets.length]
        );
        useListener(window, "resize", throttleForAnimation(() => this.adjustVisibleFacets()));
    }

    /**
     * @param {number} [index]
     */
    focusFacet(index) {
        const facets = this.root().getElementsByClassName("o_searchview_facet");
        if (facets.length) {
            if (index === undefined) {
                facets[facets.length - 1].focus();
            } else {
                facets[index].focus();
            }
        }
    }

    /**
     * @param {Object} facet
     */
    removeFacet(facet) {
        this.env.searchModel.deactivateGroup(facet.groupId);
        if (!this.dropdownState.isOpen) {
            this.inputRef().focus();
        }
    }

    /**
     * Measures how many active facets fit on the compact bar's single line,
     * collapsing the rest behind a "+N" badge. All facets are always rendered
     * (the template never slices them) so their natural widths can always be
     * measured; the ones that don't fit are hidden via a CSS class here,
     * imperatively, rather than by feeding a slice back into the template
     * (which would leave nothing to re-measure once some are hidden). Facets
     * that fit stay fully interactive; the popover's clone (SearchBarMenu)
     * always shows all of them regardless of this count.
     */
    adjustVisibleFacets() {
        const container = this.facetContainerRef();
        if (!container) {
            return;
        }

        const facetEls = [...container.querySelectorAll(":scope > .o_searchview_facet")];
        for (const el of facetEls) {
            el.classList.remove("d-none");
        }
        if (!facetEls.length) {
            this.state.visibleFacetCount = 0;
            return;
        }

        const available = container.clientWidth;
        let usedWidth = 0;
        let count = 0;
        for (const el of facetEls) {
            usedWidth += el.getBoundingClientRect().width + FACET_GAP;
            if (usedWidth > available && count > 0) {
                break;
            }
            count++;
        }
        for (let i = count; i < facetEls.length; i++) {
            facetEls[i].classList.add("d-none");
        }
        this.state.visibleFacetCount = count;
    }

    setupFacetNavigation() {
        const isFacet = (target) => target && target.classList.contains("o_searchview_facet");

        useNavigation(this.facetContainerRef, {
            shouldFocusChildInput: false,
            isNavigationAvailable: ({ target }) =>
                !this.dropdownState.isOpen && !!this.facetContainerRef()?.contains(target),
            getItems: () => {
                if (this.root() && this.inputRef()) {
                    return [
                        ...this.root().querySelectorAll(":scope .o_searchview_facet"),
                        this.inputRef(),
                    ];
                }
                return [];
            },
            hotkeys: {
                enter: {
                    callback: () => this.env.searchModel.search(),
                },
                arrowdown: {
                    callback: () => this.env.searchModel.trigger("focus-view"),
                },
                backspace: {
                    bypassEditableProtection: true,
                    allowRepeat: false,
                    isAvailable: ({ target }) =>
                        isFacet(target) ||
                        (target.selectionStart === 0 && target.selectionEnd === 0),
                    callback: (navigator) => {
                        const facets = this.env.searchModel.facets;
                        if (isFacet(navigator.activeItem.el)) {
                            this.removeFacet(facets[navigator.activeItemIndex]);
                        } else if (facets.length > 0) {
                            this.removeFacet(facets[facets.length - 1]);
                        }
                    },
                },
                arrowright: {
                    bypassEditableProtection: true,
                    allowRepeat: false,
                    isAvailable: ({ target }) =>
                        isFacet(target) || target.selectionStart === this.inputRef().value.length,
                    callback: (navigator) => {
                        navigator.next();
                        if (navigator.activeItem.el === this.inputRef()) {
                            this.inputRef().setSelectionRange(0, 0);
                        }
                    },
                },
                arrowleft: {
                    bypassEditableProtection: true,
                    isAvailable: ({ target }) => isFacet(target) || target.selectionStart === 0,
                    callback: (navigator) => {
                        navigator.previous();
                        if (navigator.activeItem.el === this.inputRef()) {
                            const inputLength = this.inputRef().value.length;
                            this.inputRef().setSelectionRange(inputLength, inputLength);
                        }
                    },
                },
            },
        });
    }

    //---------------------------------------------------------------------
    // Handlers
    //---------------------------------------------------------------------

    onFacetLabelClick(target, facet) {
        const { domain, groupId } = facet;
        if ((this.env.searchModel.canOrderByCount && facet.type === "groupBy") || !domain) {
            return;
        }
        const { resModel } = this.env.searchModel;
        this.dialogService.add(DomainSelectorDialog, {
            resModel,
            domain,
            context: this.env.searchModel.domainEvalContext,
            onConfirm: (nextDomain) => {
                if (nextDomain !== domain) {
                    this.env.searchModel.splitAndAddDomain(nextDomain, groupId);
                }
            },
            disableConfirmButton: (domain) => domain === `[]`,
            title: _t("Custom Filter"),
            confirmButtonText: _t("Search"),
            discardButtonText: _t("Discard"),
            isDebugMode: this.env.searchModel.isDebugMode,
        });
    }

    /**
     * @param {Object} facet
     */
    onFacetRemove(facet) {
        this.removeFacet(facet);
    }

    onOverflowBadgeClick() {
        this.openMenu("");
    }

    /**
     * Opens the merged SearchBarMenu popover, seeding it with the given query.
     * @param {string} query
     */
    openMenu(query) {
        if (!this.dropdownState.isOpen) {
            this.handoff.seedQuery = query;
            this.dropdownState.open();
        }
    }

    onSearchClick() {
        if (!hasTouch()) {
            this.openMenu(this.inputRef().value || "");
        }
    }

    /**
     * @param {InputEvent} ev
     */
    onSearchInput(ev) {
        if (ev.isComposing) {
            return;
        }
        const query = ev.target.value;
        if (query.trim()) {
            this.openMenu(query);
        }
    }

    /**
     * @param {CompositionEvent} ev
     */
    onCompositionEnd(ev) {
        const query = ev.target.value;
        if (query.trim()) {
            this.openMenu(query);
        }
    }
}
