import { setOptionValueIfNotSet } from "@html_builder/website_builder/plugins/options/dynamic_snippet_option_plugin";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import {
    DynamicSnippetProductsOption,
    getContextualFilterDomain,
} from "./dynamic_snippet_products_option";

class DynamicSnippetProductsOptionPlugin extends Plugin {
    static id = "dynamicSnippetProductsOption";
    static dependencies = ["dynamicSnippetCarouselOption"];
    selector = ".s_dynamic_snippet_products";
    modelNameFilter = "product.product";
    resources = {
        builder_options: {
            OptionComponent: DynamicSnippetProductsOption,
            props: {
                ...this.dependencies.dynamicSnippetCarouselOption.getComponentProps(),
                modelNameFilter: this.modelNameFilter,
                fetchCategories: this.fetchCategories.bind(this),
            },
            selector: this.selector,
        },
        dynamic_snippet_template_updated: this.onTemplateUpdated.bind(this),
        on_snippet_dropped_handlers: async ({ snippetEl }) =>
            await this.onSnippetDropped(
                snippetEl,
                this.selector,
                this.modelNameFilter,
                getContextualFilterDomain(this.editable)
            ),
    };
    setup() {
        this.categories = undefined;
    }
    destroy() {
        super.destroy();
        this.categories = undefined;
    }
    async onSnippetDropped(snippetEl, selector, modelNameFilter, contextualFilterDomain) {
        if (snippetEl.matches(selector)) {
            for (const [optionName, value] of [
                ["productCategoryId", "all"],
                ["showVariants", true],
            ]) {
                setOptionValueIfNotSet(snippetEl, optionName, value);
            }
            await this.dependencies.dynamicSnippetCarouselOption.setOptionsDefaultValues(
                snippetEl,
                modelNameFilter,
                contextualFilterDomain
            );
        }
    }
    onTemplateUpdated({ el, template }) {
        if (el.matches(this.selector)) {
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
