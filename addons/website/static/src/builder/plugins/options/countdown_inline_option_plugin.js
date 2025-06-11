import { before, SNIPPET_SPECIFIC_END } from "@html_builder/utils/option_sequence";
import { withSequence } from "@html_editor/utils/resource";
import { registry } from "@web/core/registry";
import { Plugin } from "@html_editor/plugin";

class CountdownInlineOptionPlugin extends Plugin {
// class CountdownInlineOptionPlugin extends Plugin {
    static id = "countdownInlineOption";
    static dependencies = ["builderActions"];
    // static dependencies = ["CountdownOption"];
    resources = {
        builder_options: [
            withSequence(before(SNIPPET_SPECIFIC_END), {
                template: "website.CountdownInlineOption",
                selector: ".s_countdown_inline",
                // cleanForSave: this.cleanForSave.bind(this),
            }),
        ],

        // ajouter une action

        so_content_addition_selector: [".s_countdown_inline"],
        builder_actions: this.getActions(),
        // builder_actions: {
        //     reloadCountdown: {
        //         apply: ({ editingElement }) => {
        //             this.dispatchTo("update_interactions", editingElement);
        //         },
        //     },
            // TODO AGAU: update after merging generalized restart interactions
            //  remove this and xml BuilderContext
            // reloadCountdownInline: {
            //     apply: ({ editingElement }) => {
            //         this.dispatchTo("update_interactions", editingElement);
            //     },
            // },
            // setEndAction: {
            //     apply: this.setEndAction.bind(this),
            //     isApplied: this.isEndActionApplied.bind(this),
            // },
            // previewEndMessage: {
            //     apply: ({ editingElement }) => this.toggleEndMessagePreview(editingElement, true),
            //     clean: ({ editingElement }) => this.toggleEndMessagePreview(editingElement, false),
            //     isApplied: this.isEndMessagePreviewed.bind(this),
            // },
            // setLayout: {
            //     apply: this.setLayout.bind(this),
            //     isApplied: this.isLayoutApplied.bind(this),
            // },
        // },
    };

    getActions() {
        const getAction = this.dependencies.builderActions.getAction;
        return {
            // Continuer ici
            selectCountdownInlineTemplate: {
                prepare: async ({ actionParam }) => {
                    await getAction("selectTemplate").prepare({ actionParam: actionParam });
                },
                isApplied: ({ editingElement, params: { templateClass } }) => {
                    const isDefaultOrTextTemplate = ["o_template_default", "o_template_text"].includes(templateClass);
                    const hasMonospaceFont = editingElement.parentElement.classList.contains("o_count_monospace");

                    // Reset the monospace option if we select a template that doesn't provide it.
                    if (hasMonospaceFont && isDefaultOrTextTemplate) {
                        editingElement.parentElement.classList.remove('o_count_monospace');

                        probleme : ca efface tout le temps
                    }
                    
                    // if(templateClass === "o_template_default" || templateClass === "o_template_text") {
                        
                        // console.log("oui")
                    // if (params.name === "countdown_inline_template_opt") {
                    //     const countdownEl = this.$target[0];
                    //     const templateEl = countdownEl.querySelector('.s_countdown_inline_wrapper > div');
                    //     const hasMonospaceFont = countdownEl.classList.contains('o_count_monospace');
                    //     if (hasMonospaceFont && isDefaultOrTextTemplate) {
                    //         countdownEl.classList.remove('o_count_monospace');
                    //     }
                    // }

                    if (templateClass) {
                        return !!editingElement.querySelector(`.${templateClass}`);
                    }
                    return true;
                },
                apply: (action) => {
                    getAction("selectTemplate").apply(action);
                },
                clean: (action) => getAction("selectTemplate").clean(action),
            },
        };
    }

    /**
     * Used to preserve modified end messages through end action changes. This
     * allows the user to test options without losing their progress while in
     * between saves.
     *
     * @type {WeakMap<Element, Element>}
     */
    // editingElEndMessages = new WeakMap();

    // cleanForSave(editingEl) {
    //     // editingEl?.classList.remove("s_countdown_enable_preview");
    //     editingEl?.classList.remove("s_countdown_enable_preview");
    // }

    // setEndAction({ editingElement, value }) {
    //     editingElement.dataset.endAction = value;
    //     const endMessageEl = editingElement.querySelector(".s_countdown_inline_end_message");

    //     // Only hide countdown in one case
    //     editingElement.classList.toggle("hide-countdown", value === "message_no_countdown");

    //     // Only have redirect url attribute in one case
    //     if (value === "redirect") {
    //         editingElement.dataset.redirectUrl = "";
    //     } else {
    //         delete editingElement.dataset.redirectUrl;
    //     }

    //     if (value === "message" || value === "message_no_countdown") {
    //         if (!endMessageEl) {
    //             const existingEndMessage = this.editingElEndMessages.get(editingElement);
    //             editingElement.appendChild(
    //                 existingEndMessage ||
    //                     renderToElement("website.s_countdown_inline.end_message")
    //             );
    //         }
    //     } else {
    //         endMessageEl?.remove();
    //         this.editingElEndMessages.set(editingElement, endMessageEl);
    //         // Reset end message preview to avoid countdown staying hidden
    //         this.toggleEndMessagePreview(editingElement, false);
    //     }
    // }

    // isEndActionApplied({ editingElement, value }) {
    //     return editingElement.dataset.endAction === value;
    // }

    // setLayout({ editingElement, value }) {
    //     switch (value) {
    //         case "circle":
    //             editingElement.dataset.progressBarStyle = "disappear";
    //             editingElement.dataset.progressBarWeight = "thin";
    //             editingElement.dataset.layoutBackground = "none";
    //             break;
    //         case "boxes":
    //             editingElement.dataset.progressBarStyle = "none";
    //             editingElement.dataset.layoutBackground = "plain";
    //             break;
    //         case "clean":
    //             editingElement.dataset.progressBarStyle = "none";
    //             editingElement.dataset.layoutBackground = "none";
    //             break;
    //         case "text":
    //             editingElement.dataset.progressBarStyle = "none";
    //             editingElement.dataset.layoutBackground = "none";
    //             break;
    //     }
    //     editingElement.dataset.layout = value;
    // }

    // isLayoutApplied({ editingElement, value }) {
    //     return editingElement.dataset.layout === value;
    // }

    // isEndMessagePreviewed({ editingElement }) {
    //     return !!editingElement?.classList.contains("s_countdown_enable_preview");
    // }

    // toggleEndMessagePreview(editingElement, doShow) {
    //     editingElement?.classList.toggle("s_countdown_enable_preview", doShow === true);
    // }
}
registry.category("website-plugins").add(CountdownInlineOptionPlugin.id, CountdownInlineOptionPlugin);
