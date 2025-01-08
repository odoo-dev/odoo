import { rpc } from "@web/core/network/rpc";
import publicWidget from "@web/legacy/js/public/public_widget";
import DynamicSnippetCarousel from "@website/snippets/s_dynamic_snippet_carousel/dynamic_snippet_carousel";

export class DynamicSnippetProducts extends DynamicSnippetCarousel {
    static selector = ".s_dynamic_snippet_products";

    /**
     * Gets the category search domain
     */
    getCategorySearchDomain() {
        const searchDomain = [];
        let productCategoryId = this.el.dataset.productCategoryId;
        if (productCategoryId && productCategoryId !== "all") {
            if (productCategoryId === "current") {
                productCategoryId = undefined;
                const productCategoryFieldEl = this.el.closest("body").querySelector("#product_details .product_category_id");
                if (productCategoryFieldEl) {
                    productCategoryId = parseInt(productCategoryFieldEl.value);
                }
                if (!productCategoryId) {
                    const mainObject = this.services.website_page.mainObject;
                    if (mainObject.model === "product.public.category") {
                        productCategoryId = mainObject.id;
                    }
                }
                if (!productCategoryId) {
                    // Try with categories from product, unfortunately the category hierarchy is not matched with this approach
                    const productTemplateIdEl = this.el.closest("body").querySelector("#product_details .product_category_id");
                    if (productTemplateIdEl) {
                        searchDomain.push(["public_categ_ids.product_tmpl_ids", "=", parseInt(productTemplateIdEl.value)]);
                    }
                }
            }
            if (productCategoryId) {
                searchDomain.push(["public_categ_ids", "child_of", parseInt(productCategoryId)]);
            }
        }
        return searchDomain;
    }

    getTagSearchDomain() {
        const searchDomain = [];
        let productTagIds = this.el.dataset.productTagIds;
        productTagIds = productTagIds ? JSON.parse(productTagIds) : [];
        if (productTagIds.length) {
            searchDomain.push(["all_product_tag_ids", "in", productTagIds.map(productTag => productTag.id)]);
        }
        return searchDomain;
    }

    /**
     * @override
     */
    getSearchDomain() {
        const searchDomain = super.getSearchDomain(...arguments);
        searchDomain.push(...this.getCategorySearchDomain());
        searchDomain.push(...this.getTagSearchDomain());
        const productNames = this.el.dataset.productNames;
        if (productNames) {
            const nameDomain = [];
            for (const productName of productNames.split(",")) {
                // Ignore empty names
                if (!productName.length) {
                    continue;
                }
                // Search on name, internal reference and barcode.
                if (nameDomain.length) {
                    nameDomain.unshift("|");
                }
                nameDomain.push(...[
                    "|", "|", ["name", "ilike", productName],
                    ["default_code", "=", productName],
                    ["barcode", "=", productName],
                ]);
            }
            searchDomain.push(...nameDomain);
        }
        if (!this.el.dataset.showVariants) {
            searchDomain.push("hide_variants");
        }
        return searchDomain;
    }

    /**
     * @override
     */
    getRpcParameters() {
        const productTemplateIdEl = this.el.closest("body").querySelector("#product_details .product_category_id");
        return Object.assign(super.getRpcParameters(...arguments), {
            productTemplateId: productTemplateIdEl ? productTemplateIdEl.value : undefined,
        });
    }

    /**
     * @override
     */
    getMainPageUrl() {
        return "/shop";
    }
}

const DynamicSnippetProductsCard = publicWidget.Widget.extend({
    selector: '.o_carousel_product_card',
    read_events: {
        'click .js_add_cart': '_onClickAddToCart',
        'click .js_remove': '_onRemoveFromRecentlyViewed',
    },

    init(root, options) {
        const parent = options.parent || root;
        this._super(parent, options);
    },

    start() {
        this.add2cartRerender = this.el.dataset.add2cartRerender === 'True';
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Event triggered by a click on the Add to cart button
     *
     * @param {OdooEvent} ev
     */
    async _onClickAddToCart(ev) {
        const dataset = ev.currentTarget.dataset;

        const productTemplateId = parseInt(dataset.productTemplateId);
        const productId = parseInt(dataset.productId);
        const isCombo = dataset.productType === 'combo';

        await this.call('websiteSale', 'addToCart', {
            productTemplateId: productTemplateId,
            productId: productId,
            isCombo: isCombo,
        });

        if (this.add2cartRerender) {
            this.trigger_up('widgets_start_request', {
                $target: this.$el.closest('.s_dynamic'),
            });
        }
    },
    /**
     * Event triggered by a click on the remove button on a "recently viewed"
     * template.
     *
     * @param {OdooEvent} ev
     */
    async _onRemoveFromRecentlyViewed(ev) {
        const rpcParams = {}
        if (ev.currentTarget.dataset.productSelected) {
            rpcParams.product_id = ev.currentTarget.dataset.productId;
        } else {
            rpcParams.product_template_id = ev.currentTarget.dataset.productTemplateId;
        }
        await rpc("/shop/products/recently_viewed_delete", rpcParams);
        this.trigger_up('widgets_start_request', {
            $target: this.$el.closest('.s_dynamic'),
        });
    },
});

publicWidget.registry.dynamic_snippet_products_cta = DynamicSnippetProductsCard;
publicWidget.registry.dynamic_snippet_products = DynamicSnippetProducts;

export default DynamicSnippetProducts;
