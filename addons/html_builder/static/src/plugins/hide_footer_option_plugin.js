import { classAction } from "@html_builder/core/plugins/core_builder_action_plugin";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

const classActionParam = { mainParam: "d-none o_snippet_invisible" };

class HideFooterOptionPlugin extends Plugin {
    static id = "hideFooterOption";
    resources = {
        builder_options: [
            {
                template: "html_builder.HideFooterOption",
                selector:
                    "[data-main-object]:has(input.o_page_option_data[name='footer_visible']) #wrapwrap > footer",
            },
        ],
        builder_actions: this.getActions(),
        save_handlers: this.onSave.bind(this),
    };

    getActions() {
        return {
            hideFooter: {
                apply: ({ editingElement }) => {
                    classAction.apply({ editingElement, param: classActionParam });
                    this.status = "invisible";
                },
                clean: ({ editingElement }) => {
                    classAction.clean({ editingElement, param: classActionParam });
                    this.status = "visible";
                },
                isApplied: ({ editingElement }) =>
                    classAction.isApplied({ editingElement, param: classActionParam }),
            },
        };
    }

    onSave() {
        if (!this.status) {
            return;
        }
        const mainObject = this.services.website.currentWebsite.metadata.mainObject;
        return Promise.all([
            this.services.orm.write(mainObject.model, [mainObject.id], {
                footer_visible: this.status === "visible",
            }),
        ]);
    }
}

registry.category("website-plugins").add(HideFooterOptionPlugin.id, HideFooterOptionPlugin);
