
import { Plugin } from "@html_editor/plugin";
import { BuilderAction } from "@html_builder/core/builder_action";
import { registry } from "@web/core/registry";

export class WishlistPageOptionPlugin extends Plugin {
    static id = "wishlistPageOption";
    resources = {
        builder_actions: {
            WishlistGridColumnsAction,
            WishlistMobileColumnsAction,
            WishlistSetGapAction,
        },
        product_design_list_to_save: {
            selector: ".o_wishlist_table",
            getData(el) {
                const data = {
                    wishlist_grid_columns: parseInt(el.dataset.wishlistGridColumns) || 5,
                    wishlist_mobile_columns: parseInt(el.dataset.wishlistMobileColumns) || 2,
                };

                // The wishlist takes the shop's design classes and gap whenever its own fields
                // are empty. Only persist wishlist-specific values once they actually deviate
                // from the shop's baseline, so unrelated edits (e.g. changing grid columns)
                // don't accidentally freeze the shop's current classes/gap into the wishlist.
                const currentClasses = Array.from(el.classList).filter((className) =>
                    className.startsWith("o_wsale_products_opt_")
                );
                const defaultClasses = (el.dataset.wishlistDefaultClasses || "")
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean);
                const matchesDefault =
                    currentClasses.length === defaultClasses.length &&
                    defaultClasses.every((className) => currentClasses.includes(className));
                if (!matchesDefault) {
                    data.wishlist_opt_products_design_classes = currentClasses.join(" ");
                }

                // The gap is only persisted when the user explicitly changed it in the builder
                // (tracked via `data-gap-to-save`, same pattern as the shop) and it differs
                // from the shop's gap. Otherwise the wishlist keeps following the shop's gap.
                const gapToSave = el.dataset.gapToSave;
                const defaultGap = el.dataset.wishlistDefaultGap || "";
                if (gapToSave !== undefined && gapToSave !== defaultGap) {
                    data.wishlist_gap = gapToSave;
                }

                return data;
            },
        },
    };
}

export class WishlistGridColumnsAction extends BuilderAction {
    static id = "wishlistGridColumns";

    isApplied({ editingElement, value }) {
        return parseInt(editingElement.dataset.wishlistGridColumns) === value;
    }
    getValue({ editingElement }) {
        return parseInt(editingElement.dataset.wishlistGridColumns);
    }
    apply({ editingElement, value }) {
        editingElement.dataset.wishlistGridColumns = value;
    }
}

export class WishlistMobileColumnsAction extends BuilderAction {
    static id = "wishlistMobileColumns";

    isApplied({ editingElement, value }) {
        return parseInt(editingElement.dataset.wishlistMobileColumns) === value;
    }
    getValue({ editingElement }) {
        return parseInt(editingElement.dataset.wishlistMobileColumns);
    }
    apply({ editingElement, value }) {
        editingElement.dataset.wishlistMobileColumns = value;
    }
}

export class WishlistSetGapAction extends BuilderAction {
    static id = "wishlistSetGap";

    isApplied() {
        return true;
    }

    getValue({ editingElement }) {
        return editingElement.style.getPropertyValue("--o-wsale-wishlist-grid-gap");
    }

    apply({ editingElement, value }) {
        editingElement.style.setProperty("--o-wsale-wishlist-grid-gap", value);
        // Track explicit gap changes (same pattern as the shop's SetGapAction) so the
        // gap is only persisted when the user actually changed it in the builder.
        editingElement.dataset.gapToSave = value;
    }
}

registry
    .category("website-plugins")
    .add(WishlistPageOptionPlugin.id, WishlistPageOptionPlugin);
