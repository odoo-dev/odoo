import { setDatasetIfUndefined } from "@website/builder/plugins/options/dynamic_snippet_option_plugin";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { getContextualFilterDomain } from "./dynamic_snippet_products_option";

export class DynamicSnippetProductsOptionPlugin extends Plugin {
    static id = "dynamicSnippetProductsOption";
    static dependencies = ["dynamicSnippetCarouselOption"];
    static shared = ["fetchCategories", "getModelNameFilter"];
    modelNameFilter = "product.product";
    resources = {
        on_dynamic_snippet_template_updated_handlers: this.onTemplateUpdated.bind(this),
        on_snippet_dropped_handlers: this.onSnippetDropped.bind(this),
    };
    setup() {
        this.categories = undefined;
    }
    destroy() {
        super.destroy();
        this.categories = undefined;
    }
    async onSnippetDropped({ snippetEl }) {
        if (snippetEl.matches(".s_dynamic_snippet_products")) {
            for (const [optionName, value] of [
                ["productCategoryId", "all"],
                ["showVariants", true],
            ]) {
                setDatasetIfUndefined(snippetEl, optionName, value);
            }
            await this.dependencies.dynamicSnippetCarouselOption.setOptionsDefaultValues(
                snippetEl,
                this.modelNameFilter,
                getContextualFilterDomain(this.editable)
            );
            await this._syncShopDesign(snippetEl);
        }
    }

    /**
     * Syncs the dropped snippet with the current /shop design settings.
     * The snippet panel HTML is pre-rendered once when the builder loads, so
     * if the user changed the shop design during the same session (without
     * closing the editor), the cached snippet HTML is stale. We fix this by
     * reading the live values from the website record and applying them.
     */
    async _syncShopDesign(snippetEl) {
        const websiteId = this.services.website.currentWebsite.id;
        const [websiteData] = await this.services.orm.read(
            "website",
            [websiteId],
            ["shop_opt_products_design_classes", "shop_gap"],
        );
        if (!websiteData) {
            return;
        }

        const designClasses = websiteData.shop_opt_products_design_classes || "";
        const gap = websiteData.shop_gap || "16px";

        // Only sync if the shop has a meaningful catalog layout set.
        if (!designClasses.includes("o_wsale_products_opt_layout_catalog")) {
            return;
        }

        // Replace all existing o_wsale_products_opt_* classes with the live shop ones.
        const currentClasses = Array.from(snippetEl.classList);
        for (const cls of currentClasses) {
            if (cls.startsWith("o_wsale_products_opt_")) {
                snippetEl.classList.remove(cls);
            }
        }
        for (const cls of designClasses.trim().split(/\s+/)) {
            if (cls) {
                snippetEl.classList.add(cls);
            }
        }

        // Apply the gap CSS variable so layout-dependent designs (e.g. Chips)
        // compute their internal padding correctly.
        snippetEl.style.setProperty("--o-wsale-products-grid-gap", gap);
    }
    getModelNameFilter() {
        return this.modelNameFilter;
    }
    onTemplateUpdated({ el, template }) {
        if (el.matches(".s_dynamic_snippet_products")) {
            this.dependencies.dynamicSnippetCarouselOption.updateTemplateSnippetCarousel(
                el,
                template
            );
        }
    }
    async fetchCategories() {
        if (!this.categories) {
            this.categories = this._fetchCategories();
        }
        return this.categories;
    }
    async _fetchCategories() {
        // TODO put in an utility function
        const websiteDomain = [
            "|",
            ["website_id", "=", false],
            ["website_id", "=", this.services.website.currentWebsite.id],
        ];
        return this.services.orm.searchRead(
            "product.public.category",
            websiteDomain,
            ["id", "name"],
            { order: "name asc" }
        );
    }
}

registry
    .category("website-plugins")
    .add(DynamicSnippetProductsOptionPlugin.id, DynamicSnippetProductsOptionPlugin);
