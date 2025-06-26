import { registry } from "@web/core/registry";
import { RelationalModel } from "@web/model/relational_model/relational_model";
import { FormRenderer } from "./form_renderer";
import { FormArchParser } from "./form_arch_parser";
import { FormController } from "./form_controller";
import { FormCompiler } from "./form_compiler";

export const formView = {
    type: "form",
    searchMenuTypes: [],
    Controller: FormController,
    Renderer: FormRenderer,
    ArchParser: FormArchParser,
    Model: RelationalModel,
    Compiler: FormCompiler,
    staticControlPanelButtons: {
        save: {
            isAvailable() {
                return this.model.root.isInEdition && this.env.inDialog;
            },
            // isVisible: "model.root.isInEdition and env.inDialog",
            template: "web.FormView.Buttons.Save",
            sequence: 10,
        },
        discard: {
            isAvailable() {
                return this.model.root.isInEdition && this.env.inDialog;
            },
            // isVisible: "model.root.isInEdition and env.inDialog",
            template: "web.FormView.Buttons.Discard",
            sequence: 20,
        },
        remove: {
            isAvailable() {
                return this.model.root.isInEdition && this.props.removeRecord && this.env.inDialog;
            },
            // isVisible: "model.root.isInEdition and props.removeRecord and env.inDialog",
            template: "web.FormView.Buttons.Remove",
            sequence: 30,
        },
        new: {
            isAvailable() {
                return (
                    this.canCreate &&
                    (!this.env.inDialog || (this.env.inDialog && !this.model.root.isInEdition))
                );
            },
            // isVisible:
            //     "canCreate and (!env.inDialog or (env.inDialog and !model.root.isInEdition))",
            template: "web.FormView.Buttons.New",
            sequence: 40,
        },
    },

    props: (genericProps, view) => {
        const { ArchParser } = view;
        const { arch, relatedModels, resModel } = genericProps;
        const archInfo = new ArchParser().parse(arch, relatedModels, resModel);

        return {
            ...genericProps,
            readonly:
                genericProps.readonly ||
                (archInfo.activeActions?.edit === false && genericProps.resId !== false),
            Model: view.Model,
            Renderer: view.Renderer,
            staticControlPanelButtons:
                genericProps.staticControlPanelButtons || view.staticControlPanelButtons,
            Compiler: view.Compiler,
            archInfo,
        };
    },
};

registry.category("views").add("form", formView);
