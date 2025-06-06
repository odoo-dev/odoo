import { MediaDialog } from "@html_editor/main/media/media_dialog/media_dialog";
import { Plugin } from "@html_editor/plugin";
import { withSequence } from "@html_editor/utils/resource";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { DEVICE_VISIBILITY } from "@website/builder/option_sequence";
import { setDatasetIfUndefined } from "@website/builder/plugins/options/dynamic_snippet_option_plugin";
import { DynamicSnippetCategoryOption } from "./dynamic_snippet_category_options";


export class DynamicSnippetCategoryOptionPlugin extends Plugin {
    static id = "dynamicSnippetCategoryOptionPlugin";
    selector = "section.s_dynamic_category"
    resources = {
        builder_options: [
            withSequence(DEVICE_VISIBILITY, {
                OptionComponent: DynamicSnippetCategoryOption,
                selector: this.selector,
                groups: ['website.group_website_designer'],
            }),
        ],
        on_snippet_dropped_handlers: this.onSnippetDropped.bind(this),
    };

    async onSnippetDropped({ snippetEl }) {
        if (snippetEl.matches(this.selector)) {
            for (const [optionName, value] of [
                ['columns', '2'],
                ['size', 'small'],
                ['filterId', '0'],
                ['allProducts', 'true'],
                ['button', 'Explore Now'],
                ['alignment', 'left'],
            ]) {
                setDatasetIfUndefined(snippetEl, optionName, value);
            }
        }
    }
}

export class CategoryMediaDialog extends MediaDialog {
    async save(){
        rpc('/snippets/category/set_image',{
            category_id: parseInt(this.props.node.parentElement.dataset.categoryId),
            media: this.selectedMedia[this.state.activeTab],
        })
        this.props.close()
        await super.save();
    }
}

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
            target_name: "websiteSaleRibbonOption",
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
                    if(el.classList.contains("category_item")){
                        await new Promise((resolve) => {
                            this.dependencies.dialog.addDialog(CategoryMediaDialog, {
                                node: imageEl,
                                onlyImages: true,
                                noDocuments: true,
                                save: resolve,
                            });
                        });
                    } else {
                        let icon;
                        await this.dependencies.media.openMediaDialog({
                            node: imageEl,
                            onlyImages: true,
                            noDocuments: true,
                            save: (newIcon) => { icon = newIcon },
                        });
                        return icon;
                    }
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
    DynamicSnippetCategoryOptionPlugin.id, DynamicSnippetCategoryOptionPlugin,
);
registry.category('website-plugins').add(
    DynamicSnippetCategoryItemOptionPlugin.id, DynamicSnippetCategoryItemOptionPlugin,
);
