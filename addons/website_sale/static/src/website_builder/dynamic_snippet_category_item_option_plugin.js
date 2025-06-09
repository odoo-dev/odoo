import { Plugin } from "@html_editor/plugin";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";


export class DynamicSnippetCategoryItemOptionPlugin extends Plugin {
    static id = 'dynamicSnippetCategoryItemOptionPlugin';
    static dependencies = ["media", "dialog", "builder-options"];
    resources = {
        builder_options: {
            template: "website_sale.dynamicSnippetCategoryItemOptions",
            selector: ".category_item, .all_products",
            editableOnly: false,
            title: _t("Category"),
        },
        builder_actions: this.getActions(),
        patch_builder_options: [{
            target_name: "ribbonOption",
            target_element: "selector",
            method: "add",
            value: ".category_item",
        }],
    }
    getActions() {
        return {
            setCategoryImage: {
                reload: {},
                load: async ({ editingElement: el }) => {
                    const imageEl = el.querySelector(".s_category_image")
                    const categId = parseInt(imageEl.parentElement.dataset.categoryId)
                    let icon;
                    await this.dependencies.media.openMediaDialog({
                        node: imageEl,
                        onlyImages: true,
                        noDocuments: true,
                        save: async (imgEls, selectedMedia, activeTab) => {
                            if (el.classList.contains("category_item")) {
                                rpc('/snippets/category/set_image',{
                                    category_id: categId,
                                    media: selectedMedia,
                                })
                            }
                            icon = imgEls;
                        },
                    });
                    return icon;
                },
                apply: ({ editingElement: el, loadResult: newImage }) => {
                    if (!(newImage instanceof HTMLImageElement)) return;
                    el.querySelector(".s_category_image").replaceWith(newImage);
                    this.dependencies["builder-options"].updateContainers(newImage);
                },
            },
        }
    }
}

registry.category('website-plugins').add(
    DynamicSnippetCategoryItemOptionPlugin.id, DynamicSnippetCategoryItemOptionPlugin,
);
