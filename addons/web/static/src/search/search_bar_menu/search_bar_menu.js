import { Domain } from "@web/core/domain";
import { serializeDate, serializeDateTime } from "@web/core/l10n/dates";
import { registry } from "@web/core/registry";
import { KeepLast } from "@web/core/utils/concurrency";
import { useBus, useChildRef, useService } from "@web/core/utils/hooks";
import { fuzzyTest } from "@web/core/utils/search";
import { PropertiesGroupByItem } from "@web/search/properties_group_by_item/properties_group_by_item";
import { SearchBarDropdown } from "../search_bar_dropdown";
import { dropdownProps } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { sortBy } from "@web/core/utils/arrays";
import { browser } from "@web/core/browser/browser";
import { useCommand } from "@web/core/commands/command_hook";
import { AccordionItem } from "@web/core/dropdown/accordion_item";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { CustomGroupByItem } from "@web/search/custom_group_by_item/custom_group_by_item";
import { CheckboxItem } from "@web/core/dropdown/checkbox_item";
import { FACET_ICONS, GROUPABLE_TYPES } from "@web/search/utils/misc";
import { _t } from "@web/core/l10n/translation";
import { Component, proxy, signal, status, t, useProps } from "@odoo/owl";
import { useLayoutEffect } from "@web/owl2/utils";
import { useNavigation } from "@web/core/navigation/navigation";
import { useSticky } from "@web/core/utils/hooks";

const favoriteMenuRegistry = registry.category("favoriteMenu");
const parsers = registry.category("parsers");

const parseValue = (value, fieldType) => {
    const parser = parsers.contains(fieldType) ? parsers.get(fieldType) : (str) => str;
    switch (fieldType) {
        case "date": {
            return serializeDate(parser(value));
        }
        case "datetime": {
            return serializeDateTime(parser(value));
        }
        case "many2one": {
            return value;
        }
        default: {
            return parser(value);
        }
    }
};

const CHAR_FIELDS = ["char", "html", "many2many", "many2one", "one2many", "text", "properties"];
const FOLDABLE_TYPES = ["properties", "many2one", "many2many"];

let nextItemId = 1;
const SUB_ITEMS_DEFAULT_LIMIT = 8;

export class SearchBarMenu extends Component {
    static template = "web.SearchBarMenu";
    static components = {
        SearchBarDropdown,
        DropdownItem,
        CheckboxItem,
        CustomGroupByItem,
        AccordionItem,
        PropertiesGroupByItem,
    };
    props = useProps({
        dropdownState: dropdownProps.state,
        popoverWillCloseOnClickAway: t.function().optional(() => () => true),
        onRemoveFacet: t.function().optional(() => () => {}),
        onFacetLabelClick: t.function().optional(() => () => {}),
        focusCompactInput: t.function().optional(() => () => {}),
        handoff: t.object().optional(() => ({ seedQuery: "" })),
        slots: t
            .object({
                toggler: t.any().optional(),
                default: t.any().optional(),
            })
            .optional(),
    });

    facetContainerRef = signal.ref();
    popoverInputRef = signal.ref();

    /**
     * Section 2 shows either the quick-search suggestions (typing) or the
     * Filter/GroupBy/Favorite panels (empty query); each has its own layout.
     */
    get menuClass() {
        // o_search_bar_popover is always present: it's what lets the popover visually
        // overlap (rather than sit below) the compact bar that anchors it, regardless
        // of which Section-2 content is currently showing.
        return this.state.query.trim()
            ? "o_searchview_autocomplete"
            : "o_searchview_panels";
    }

    setup() {
        this.facet_icons = FACET_ICONS;
        // Filter
        this.actionService = useService("action");
        // GroupBy
        const fields = [];
        for (const [fieldName, field] of Object.entries(this.env.searchModel.searchViewFields)) {
            if (this.validateField(fieldName, field)) {
                fields.push(Object.assign({ name: fieldName }, field));
            }
        }
        this.fields = sortBy(fields, "string");
        // Favorite
        this.state = proxy({
            sharedFavoritesExpanded: false,
            expanded: [],
            query: "",
            subItemsLimits: {},
        });
        useBus(this.env.searchModel, "update", this.render);
        this.dialogService = useService("dialog");
        this.notificationService = useService("notification");

        this.facetContainerRefSticky = useSticky(this.facetContainerRef);

        // Quick search (autocomplete)
        this.searchViewFields = this.env.searchModel.searchViewFields;
        this.searchItemsFields = this.env.searchModel.getSearchItems((f) => f.type === "field");
        this.items = proxy([]);
        this.subItems = {};
        this.orm = useService("orm");
        this.keepLast = new KeepLast();
        this.menuRef = useChildRef();

        this.setupFacetNavigation();
        this.dropdownNavOptions = this.getDropdownNavigation();

        useLayoutEffect(
            () => {

                if (this.props.dropdownState.isOpen) {
                    this.computeState({
                        query: this.props.handoff.seedQuery || "",
                        expanded: [],
                        subItems: [],
                    });
                    this.focusPopoverInput();
                } else if (status(this) === "mounted") {
                    this.resetState({ focus: false });
                }
            },
            () => [this.props.dropdownState.isOpen]
        );

        // Add Share command
        if (this.env.config.actionId && !this.env.inDialog) {
            // TODO JESC FIXME BUG CLOSING SOME DIALOG (LIKE INVOICE), WRONG ACTIVE ELEMENT
            useCommand(_t("Share"), () => this.shareViewUrl(), {
                hotkey: "alt+shift+h",
                hotkeyOptions: { bypassEditableProtection: true },
            });
        }
    }

    //---------------------------------------------------------------------
    // Quick search (autocomplete)
    //---------------------------------------------------------------------

    /**
     * @param {number} id
     * @param {Object}
     */
    getSearchItem(id) {
        return this.env.searchModel.searchItems[id];
    }

    /**
     * @param {Object} [options={}]
     * @param {number[]} [options.expanded]
     * @param {string} [options.query]
     * @param {Object[]} [options.subItems]
     * @returns {Object[]}
     */
    async computeState(options = {}) {
        const query = "query" in options ? options.query : this.state.query;
        const expanded = "expanded" in options ? options.expanded : this.state.expanded;
        const subItems = "subItems" in options ? options.subItems : this.subItems;

        const tasks = [];
        for (const id of expanded) {
            const searchItem = this.getSearchItem(id);
            if (searchItem.type === "field" && searchItem.fieldType === "properties") {
                tasks.push({ id, prom: this.getSearchItemsProperties(searchItem) });
            } else if (!subItems[id]) {
                if (!this.state.subItemsLimits[id]) {
                    this.state.subItemsLimits[id] = SUB_ITEMS_DEFAULT_LIMIT;
                }
                tasks.push({ id, prom: this.computeSubItems(searchItem, query) });
            }
        }

        const prom = this.keepLast.add(Promise.all(tasks.map((task) => task.prom)));

        if (tasks.length) {
            const taskResults = await prom;
            tasks.forEach((task, index) => {
                subItems[task.id] = taskResults[index];
            });
        }

        this.state.expanded = expanded;
        this.state.query = query;
        this.subItems = subItems;

        const inputEl = this.popoverInputRef();
        if (inputEl) {
            inputEl.value = query;
        }

        const trimmedQuery = this.state.query.trim();

        this.items.length = 0;
        if (!trimmedQuery) {
            return;
        }

        for (const searchItem of this.searchItemsFields) {
            this.items.push(...this.getItems(searchItem, trimmedQuery));
        }

        this.items.push({
            title: _t("Add a custom filter"),
            isAddCustomFilterButton: true,
        });
    }

    /**
     * @param {Object} searchItem
     * @param {string} trimmedQuery
     * @returns {Object[]}
     */
    getItems(searchItem, trimmedQuery) {
        const items = [];

        const isFieldProperty = searchItem.type === "field_property";
        const fieldType = this.getFieldType(searchItem);

        /** @todo do something with respect to localization (rtl) */
        let preposition = this.getPreposition(searchItem);

        if ((isFieldProperty && FOLDABLE_TYPES.includes(fieldType)) || fieldType === "properties") {
            // Do not chose preposition for foldable properties
            // or the properties item itself
            preposition = null;
        }
        if (
            ["boolean", "tags"].includes(fieldType) ||
            (isFieldProperty && fieldType === "selection")
        ) {
            const booleanOptions = [
                [true, _t("Yes")],
                [false, _t("No")],
            ];
            let options;
            if (isFieldProperty) {
                const { selection, tags } = searchItem.propertyFieldDefinition || {};
                options = selection || tags || booleanOptions;
            } else {
                options = booleanOptions;
            }
            for (const [value, label] of options) {
                if (fuzzyTest(trimmedQuery.toLowerCase(), label.toLowerCase())) {
                    items.push({
                        id: nextItemId++,
                        fieldType,
                        searchItemDescription: searchItem.description,
                        preposition,
                        searchItemId: searchItem.id,
                        label,
                        /** @todo check if searchItem.operator is fine (here and elsewhere) */
                        operator: searchItem.operator || "=",
                        value,
                        isFieldProperty,
                    });
                }
            }
            return items;
        }

        let value;
        try {
            value = parseValue(trimmedQuery, fieldType);
        } catch {
            return [];
        }

        const item = {
            id: nextItemId++,
            fieldType,
            searchItemDescription: searchItem.description,
            preposition,
            searchItemId: searchItem.id,
            label: this.state.query,
            operator: searchItem.operator || (CHAR_FIELDS.includes(fieldType) ? "ilike" : "="),
            value,
            isFieldProperty,
        };

        if (isFieldProperty) {
            item.isParent = FOLDABLE_TYPES.includes(fieldType);
            item.unselectable = FOLDABLE_TYPES.includes(fieldType);
            item.propertyItemId = searchItem.propertyItemId;
        } else if (fieldType === "properties") {
            item.isParent = true;
            item.unselectable = true;
        } else if (fieldType === "many2one" || fieldType === "selection") {
            item.isParent = true;
        }

        if (item.isParent) {
            item.isExpanded = this.state.expanded.includes(item.searchItemId);
        }

        items.push(item);

        if (item.isExpanded) {
            if (searchItem.type === "field" && searchItem.fieldType === "properties") {
                for (const subItem of this.subItems[searchItem.id]) {
                    items.push(...this.getItems(subItem, trimmedQuery));
                }
            } else {
                items.push(...this.subItems[searchItem.id]);
            }
        }

        return items;
    }

    getPreposition(searchItem) {
        const fieldType = this.getFieldType(searchItem);
        return ["date", "datetime"].includes(fieldType) ? _t("at") : _t("for");
    }

    getFieldType(searchItem) {
        const { type } =
            searchItem.type === "field_property"
                ? searchItem.propertyFieldDefinition
                : this.searchViewFields[searchItem.fieldName];
        const fieldType = type === "reference" ? "char" : type;

        return fieldType;
    }

    /**
     * @param {Object} searchItem
     * @returns {Object[]}
     */
    getSearchItemsProperties(searchItem) {
        return this.env.searchModel.getSearchItemsProperties(searchItem);
    }

    /**
     * @param {Object} searchItem
     * @param {string} query
     * @returns {Object[]}
     */
    async computeSubItems(searchItem, query) {
        const field = this.searchViewFields[searchItem.fieldName];
        let options = [];
        let showLoadMore = false;
        if (searchItem.fieldType === "selection") {
            options = field.selection.filter(([_, label]) =>
                fuzzyTest(query.toLowerCase(), label.toLowerCase())
            );
        } else {
            let domain = [];
            if (searchItem.domain) {
                const domainEvalContext = {
                    ...this.env.searchModel.domainEvalContext,
                    ...field.context,
                };
                domain = new Domain(searchItem.domain).toList(domainEvalContext);
            }
            const relation =
                searchItem.type === "field_property"
                    ? searchItem.propertyFieldDefinition.comodel
                    : field.relation;

            const limitToFetch = this.state.subItemsLimits[searchItem.id] + 1;
            options = await this.orm.call(relation, "name_search", [], {
                domain: domain,
                context: { ...this.env.searchModel.globalContext, ...field.context },
                limit: limitToFetch,
                name: query.trim(),
            });

            if (options.length === limitToFetch) {
                options.pop();
                showLoadMore = true;
            }
        }

        const subItems = [];
        if (options.length) {
            const operator = searchItem.operator || "=";
            for (const [value, label] of options) {
                subItems.push({
                    id: nextItemId++,
                    isChild: true,
                    searchItemId: searchItem.id,
                    value,
                    label,
                    operator,
                });
            }
            if (showLoadMore) {
                subItems.push({
                    id: nextItemId++,
                    isChild: true,
                    searchItemId: searchItem.id,
                    label: _t("Load more"),
                    unselectable: true,
                    loadMore: () => {
                        this.state.subItemsLimits[searchItem.id] += SUB_ITEMS_DEFAULT_LIMIT;
                        const newSubItems = [...this.subItems];
                        newSubItems[searchItem.id] = undefined;
                        this.computeState({ subItems: newSubItems });
                    },
                });
            }
        } else {
            subItems.push({
                id: nextItemId++,
                isChild: true,
                searchItemId: searchItem.id,
                label: _t("(no result)"),
                unselectable: true,
            });
        }
        return subItems;
    }

    /**
     * The popover's content (including the input) is mounted by the popover
     * service on a separate render tick from this component's own; retry
     * across animation frames until it's actually there instead of silently
     * giving up (which left both the seed value and focus handoff dropped).
     */
    focusPopoverInput() {
        const inputEl = this.popoverInputRef();
        if (inputEl) {
            inputEl.value = this.state.query;
            inputEl.focus();
            if (this.navigator) {
                this.navigator.items[0]?.setActive();
            }
        } else if (this.props.dropdownState.isOpen && status(this) !== "destroyed") {
            requestAnimationFrame(() => this.focusPopoverInput());
        }
    }

    resetState(options = { focus: true }) {
        this.state.subItemsLimits = {};
        this.computeState({ expanded: [], query: "", subItems: [] });
        if (options.focus) {
            this.props.focusCompactInput();
        }
    }

    /**
     * @param {Object} item
     */
    selectItem(item) {
        if (item.isAddCustomFilterButton) {
            return this.env.searchModel.spawnCustomFilterDialog();
        }

        const searchItem = this.getSearchItem(item.searchItemId);
        if (
            (searchItem.fieldType === "selection" && !item.isChild) ||
            (searchItem.type === "field" && searchItem.fieldType === "properties") ||
            (searchItem.type === "field_property" && item.unselectable)
        ) {
            this.toggleItem(item, !item.isExpanded);
            return;
        }

        if (!item.unselectable) {
            const { searchItemId, fieldType, operator } = item;
            let { label, value } = item;
            if (
                !["selection", "boolean", "tags"].includes(fieldType) &&
                this.state.query !== label &&
                !item.isChild
            ) {
                // The query (the search input) changed but it hasn't been reflected yet in the
                // items (a rendering is scheduled but hasn't been applied to the DOM yet), so select
                // the item but use the current query. Typical usecase is when scanning a barcode,
                // as the keystrokes are closer than when a user uses a regular keyboard.
                label = this.state.query;
                value = parseValue(this.state.query.trim(), fieldType);
            }
            this.env.searchModel.addAutoCompletionValues(searchItemId, { label, operator, value });
        }

        if (item.loadMore) {
            item.loadMore();
        } else {
            this.props.dropdownState.close();
            this.resetState();
        }
    }

    /**
     * @param {Object} item
     * @param {boolean} shouldExpand
     */
    toggleItem(item, shouldExpand) {
        const id = item.searchItemId;
        const expanded = [...this.state.expanded];
        const index = expanded.findIndex((id0) => id0 === id);
        if (shouldExpand === true) {
            if (index < 0) {
                expanded.push(id);
            }
        } else {
            if (index >= 0) {
                expanded.splice(index, 1);
            }
        }
        this.computeState({ expanded });
    }

    /**
     * @param {InputEvent} ev
     */
    onSearchInput(ev) {
        if (!ev.isComposing) {
            this.computeState({ query: ev.target.value, expanded: [], subItems: [] });
        }
    }

    /**
     * @param {CompositionEvent} ev
     */
    onCompositionEnd(ev) {
        this.computeState({ query: ev.target.value, expanded: [], subItems: [] });
    }

    setupFacetNavigation() {
        const isFacet = (target) => target && target.classList.contains("o_searchview_facet");

        useNavigation(this.facetContainerRef, {
            shouldFocusChildInput: false,
            isNavigationAvailable: ({ target }) =>
                this.props.dropdownState.isOpen && !!this.facetContainerRef()?.contains(target),
            getItems: () => {
                if (this.facetContainerRef() && this.popoverInputRef()) {
                    return [
                        ...this.facetContainerRef().querySelectorAll(":scope .o_searchview_facet"),
                        this.popoverInputRef(),
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
                            this.onFacetRemove(facets[navigator.activeItemIndex]);
                        } else if (facets.length > 0) {
                            this.onFacetRemove(facets[facets.length - 1]);
                        }
                    },
                },
                arrowright: {
                    bypassEditableProtection: true,
                    allowRepeat: false,
                    isAvailable: ({ target }) =>
                        isFacet(target) || target.selectionStart === this.state.query.length,
                    callback: (navigator) => {
                        navigator.next();
                        if (navigator.activeItem.el === this.popoverInputRef()) {
                            this.popoverInputRef().setSelectionRange(0, 0);
                        }
                    },
                },
                arrowleft: {
                    bypassEditableProtection: true,
                    isAvailable: ({ target }) => isFacet(target) || target.selectionStart === 0,
                    callback: (navigator) => {
                        navigator.previous();
                        if (navigator.activeItem.el === this.popoverInputRef()) {
                            const inputLength = this.popoverInputRef().value.length;
                            this.popoverInputRef().setSelectionRange(inputLength, inputLength);
                        }
                    },
                },
            },
        });
    }

    /**
     * @returns {import("@web/core/navigation/navigation").NavigationOptions}
     */
    getDropdownNavigation() {
        const isExpansible = (index) => {
            const item = this.items[index];
            return item && item.isParent;
        };

        const isCollapsible = (index) => {
            const item = this.items[index];
            return (
                item && ((item.isParent && item.isExpanded) || item.isChild || item.isFieldProperty)
            );
        };

        return {
            virtualFocus: true,
            getItems: () => this.menuRef.el?.querySelectorAll(":scope .o-dropdown-item") ?? [],
            isNavigationAvailable: ({ navigator, target }) =>
                this.props.dropdownState.isOpen &&
                (this.facetContainerRef()?.contains(target) || navigator.contains(target)),
            onUpdated: (navigator) => (this.navigator = navigator),
            onItemActivated: (itemEl) => (this.lastActiveItemId = parseInt(itemEl.id, 10)),
            hotkeys: {
                escape: {
                    callback: () => {
                        this.props.dropdownState.close();
                        this.resetState();
                    },
                },
                arrowright: {
                    bypassEditableProtection: true,
                    allowRepeat: false,
                    isAvailable: ({ navigator }) => isExpansible(navigator.activeItemIndex),
                    callback: (navigator) => {
                        const item = this.items[navigator.activeItemIndex];
                        if (item.isParent) {
                            if (item.isExpanded) {
                                navigator.next();
                            } else {
                                this.toggleItem(item, true);
                            }
                        }
                    },
                },
                arrowleft: {
                    bypassEditableProtection: true,
                    isAvailable: ({ navigator }) => isCollapsible(navigator.activeItemIndex),
                    callback: (navigator) => {
                        const item = this.items[navigator.activeItemIndex];

                        const findIndex = (id) =>
                            this.items.findIndex(
                                (item) => item.isParent && item.searchItemId === id
                            );
                        if (item && item.isParent && item.isExpanded) {
                            this.toggleItem(item, false);
                        } else if (item && item.isChild) {
                            navigator.items[findIndex(item.searchItemId)]?.setActive();
                        } else if (item && item.isFieldProperty) {
                            navigator.items[findIndex(item.propertyItemId)]?.setActive();
                        } else if (this.popoverInputRef().selectionStart === 0) {
                            navigator.items[this.env.searchModel.facets.length - 1]?.setActive();
                        }
                    },
                },
            },
        };
    }

    //---------------------------------------------------------------------
    // Facets (shared between compact bar and this popover's clone)
    //---------------------------------------------------------------------

    onFacetLabelClick(target, facet) {
        this.props.onFacetLabelClick(target, facet);
    }

    /**
     * @param {Object} facet
     */
    onFacetRemove(facet) {
        this.props.onRemoveFacet(facet);
        this.popoverInputRef()?.focus();
    }

    // Filter Panel
    get filterItems() {
        return this.env.searchModel.getSearchItems((searchItem) =>
            ["filter", "dateFilter", "parentFilter", "lazyParentFilter"].includes(searchItem.type)
        );
    }

    async onAddCustomFilterClick() {
        this.env.searchModel.spawnCustomFilterDialog();
    }

    /**
     * @param {Object} param0
     * @param {number} param0.itemId
     * @param {number} [param0.optionId]
     */
    onFilterSelected({ itemId, optionId }) {
        if (optionId) {
            this.env.searchModel.toggleParentFilter(itemId, optionId);
        } else {
            this.env.searchModel.toggleSearchItem(itemId);
        }
    }

    async onToggle({ itemId, optionsParams }) {
        if (optionsParams.toBeLoaded) {
            await this.env.searchModel.loadLazyParentFilter(itemId);
            this.render();
        }
    }

    async onLoadMoreOptions({ itemId }) {
        await this.env.searchModel.loadMoreOptions(itemId);
        this.render();
    }

    // GroupBy Panel
    /**
     * @returns {boolean}
     */
    get hideCustomGroupBy() {
        return this.env.searchModel.hideCustomGroupBy || false;
    }

    /**
     * @returns {Object[]}
     */
    get groupByItems() {
        return this.env.searchModel.getSearchItems(
            (searchItem) =>
                ["groupBy", "dateGroupBy"].includes(searchItem.type) && !searchItem.isProperty
        );
    }

    /**
     * @param {string} fieldName
     * @param {Object} field
     * @returns {boolean}
     */
    validateField(fieldName, field) {
        const { groupable, type } = field;
        return groupable && fieldName !== "id" && GROUPABLE_TYPES.includes(type);
    }

    /**
     * @param {Object} param0
     * @param {number} param0.itemId
     * @param {number} [param0.optionId]
     */
    onGroupBySelected({ itemId, optionId }) {
        if (optionId) {
            this.env.searchModel.toggleDateGroupBy(itemId, optionId);
        } else {
            this.env.searchModel.toggleSearchItem(itemId);
        }
    }

    /**
     * @param {string} fieldName
     */
    onAddCustomGroup(fieldName) {
        this.env.searchModel.createNewGroupBy(fieldName);
    }

    // Favorite Panel

    get favorites() {
        return this.env.searchModel.getSearchItems(
            (searchItem) => searchItem.type === "favorite" && searchItem.userIds.length === 1
        );
    }

    get sharedFavorites() {
        const sharedFavorites = this.env.searchModel.getSearchItems(
            (searchItem) => searchItem.type === "favorite" && searchItem.userIds.length !== 1
        );
        if (sharedFavorites.length <= 4 || this.state.sharedFavoritesExpanded) {
            this.state.sharedFavoritesExpanded = true;
        } else {
            sharedFavorites.length = 3;
        }
        return sharedFavorites;
    }

    get otherItems() {
        const registryMenus = [];
        for (const item of favoriteMenuRegistry.getAll()) {
            if ("isDisplayed" in item ? item.isDisplayed(this.env) : true) {
                registryMenus.push({
                    Component: item.Component,
                    groupNumber: item.groupNumber,
                    key: item.Component.name,
                });
            }
        }
        return registryMenus;
    }

    onFavoriteSelected(itemId) {
        this.env.searchModel.toggleSearchItem(itemId);
    }

    editFavorite(itemId) {
        this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: "ir.filters",
            views: [[false, "form"]],
            context: {
                form_view_ref: "base.ir_filters_view_edit_form",
            },
            res_id: this.env.searchModel.searchItems[itemId].serverSideId,
        });
    }

    /**
     * Adds encoded active filters to the current url and copies it to the user's
     * clipboard if possible. This url is parsed to reactivate filters if in route.
     */
    async shareViewUrl() {
        let shareUrl = browser.location.href;
        const extra = this.env.searchModel.generateQueryString();
        if (extra) {
            const [base, hash = ""] = browser.location.href.split("#");
            shareUrl = base + (base.includes("?") ? "&" : "?") + extra + (hash ? "#" + hash : "");
        }

        try {
            await navigator.clipboard.writeText(shareUrl);
        } catch {
            // Can fail in some context like if the browser is unsafe.
            this.dialogService.add(AlertDialog, {
                title: _t("Share the current view"),
                body: _t(
                    "You can use the link below to share the current view with its filters: \n\n %(url)s",
                    { url: shareUrl }
                ),
            });
            return;
        }

        const maxSafeUrlLength = 2000; // Chrome v.143. working up to 450000 chars and firefox > 500000 chars
        if (shareUrl.length < maxSafeUrlLength) {
            this.notificationService.add(_t("Link copied to clipboard"), { type: "success" });
        } else {
            this.notificationService.add(
                _t("Warning: Link copied to clipboard might be too long for some browsers"),
                { type: "warning" }
            );
        }
    }
}
