import { registry } from "@web/core/registry";
import { RelationalModel } from "@web/model/relational_model/relational_model";
import { ListArchParser } from "./list_arch_parser";
import { ListController } from "./list_controller";
import { ListRenderer } from "./list_renderer";

export const listView = {
    type: "list",

    Controller: ListController,
    Renderer: ListRenderer,
    ArchParser: ListArchParser,
    Model: RelationalModel,

    canOrderByCount: true,
    staticControlPanelButtons: {
        save: {
            isAvailable() {
                return this.editedRecord;
            },
            sequence: 10,
            template: "web.ListView.Buttons.Save",
        },
        discard: {
            isAvailable() {
                return this.editedRecord;
            },
            sequence: 20,
            template: "web.ListView.Buttons.Discard",
        },
        new: {
            isAvailable() {
                return !this.editedRecord && this.canCreate && !this.env.inDialog;
            },
            sequence: 30,
            template: "web.ListView.Buttons.New",
        },
    },

    props: (genericProps, view) => {
        const { ArchParser } = view;
        const { arch, relatedModels, resModel } = genericProps;
        const archInfo = new ArchParser().parse(arch, relatedModels, resModel);
        return {
            ...genericProps,
            readonly: genericProps.readonly || !archInfo.activeActions?.edit,
            Model: view.Model,
            Renderer: view.Renderer,
            staticControlPanelButtons: view.staticControlPanelButtons,
            archInfo,
        };
    },
};

registry.category("views").add("list", listView);
