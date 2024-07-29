import { htmlField, HtmlField } from "@html_editor/fields/html_field";
import { EventBus, onWillStart, reactive, useState, useSubEnv } from "@odoo/owl";
import { getBundle, LazyComponent, loadBundle } from "@web/core/assets";
import { registry } from "@web/core/registry";
import { Deferred, Mutex } from "@web/core/utils/concurrency";
import weUtils from "@web_editor/js/common/utils";
import { MassMailingTemplateSelector } from "./mass_mailing_template_selector";

const legacyEventToNewEvent = {
    historyStep: "ADD_STEP",
    historyUndo: "HISTORY_UNDO",
    historyRedo: "HISTORY_REDO",
};

/**
 * Swap the previous theme's default images with the new ones.
 * (Redefine the `src` attribute of all images in a $container, depending on the theme parameters.)
 *
 * @private
 * @param {Object} themeParams
 * @param {JQuery} $container
 */
function switchImages(themeParams, $container) {
    if (!themeParams) {
        return;
    }
    for (const img of $container.find("img")) {
        const $img = $(img);
        const src = $img.attr("src");
        $img.removeAttr("loading");

        let m = src.match(/^\/web\/image\/\w+\.s_default_image_(?:theme_[a-z]+_)?(.+)$/);
        if (!m) {
            m = src.match(
                /^\/\w+\/static\/src\/img\/(?:theme_[a-z]+\/)?s_default_image_(.+)\.[a-z]+$/
            );
        }
        if (!m) {
            return;
        }

        if (themeParams.get_image_info) {
            const file = m[1];
            const imgInfo = themeParams.get_image_info(file);

            const src = imgInfo.format
                ? `/${imgInfo.module}/static/src/img/theme_${themeParams.name}/s_default_image_${file}.${imgInfo.format}`
                : `/web/image/${imgInfo.module}.s_default_image_theme_${themeParams.name}_${file}`;

            $img.attr("src", src);
        }
    }
}
export class MassMailingHtmlField extends HtmlField {
    static template = "mass_mailing.MassMailingHtmlField";
    static components = { ...HtmlField.components, LazyComponent, MassMailingTemplateSelector };
    static props = {
        ...HtmlField.props,
        filterTemplates: Boolean,
    };

    setup() {
        super.setup();
        const content = this.props.record.data[this.props.name];
        this.state = useState({
            showMassMailingTemplateSelector: content.toString() === "",
            iframeDocument: null,
        });
        this.fieldConfig = reactive({
            selectedTheme: null,
            $scrollable: null,
        });

        useSubEnv({
            switchImages,
            fieldConfig: this.fieldConfig,
        });

        onWillStart(async () => {
            await loadBundle("web_editor.backend_assets_wysiwyg");

            await loadBundle("web_editor.assets_wysiwyg");
            await loadBundle("mass_mailing.assets_snippets_menu");

            this.iframeBundle = getBundle("web_editor.wysiwyg_iframe_editor_assets");
            this.massMailingBundle = getBundle("mass_mailing.iframe_css_assets_edit");

            this.getColorPickerTemplateService = this.env.services.get_color_picker_template;

            const { MassMailingSnippetsMenu } = await odoo.loader.modules.get(
                "@mass_mailing/js/snippets.editor"
            );
            this.MassMailingSnippetsMenu = MassMailingSnippetsMenu;
        });
    }

    get snippetMenuProps() {
        const editor = this.editor;
        const state = this.state;
        const options = {
            mutex: new Mutex(),
            snippets: "mass_mailing.email_designer_snippets",
            selectorEditableArea: ".o_editable",
            get document() {
                return state.iframeDocument;
            },
            wysiwyg: {
                get document() {
                    return state.iframeDocument;
                },
                get $editable() {
                    return $(editor.editable);
                },
                getEditable: () => $(editor.editable),
                isSaving: () => false,
                getColorpickerTemplate: () => {
                    return this.getColorPickerTemplateService();
                },
                state: {
                    toolbarProps: {},
                },
                odooEditor: {
                    get document() {
                        return state.iframeDocument;
                    },

                    addEventListener: (legacyEvent) => {
                        const event = legacyEventToNewEvent[legacyEvent];
                        // if (!event) {
                        //     throw new Error(`Missing event to map ${legacyEvent}`);
                        // }
                    },
                    removeEventListener() {},

                    /**
                     * Find all descendants of `element` with a `data-call` attribute and bind
                     * them on click to the execution of the command matching that
                     * attribute.
                     */
                    bindExecCommand(element) {
                        // for (const buttonEl of element.querySelectorAll("[data-call]")) {
                        //     buttonEl.addEventListener("click", (ev) => {
                        //         if (!this.isSelectionInEditable()) {
                        //             this.historyResetLatestComputedSelection(true);
                        //         }
                        //         const arg1 = buttonEl.dataset.arg1;
                        //         const args = (arg1 && arg1.split(",")) || [];
                        //         this.execCommand(buttonEl.dataset.call, ...args);
                        //         ev.preventDefault();
                        //         this._updateToolbar();
                        //     });
                        // }
                    },
                    computeFontSizeSelectorValues() {},

                    historyStep() {},
                    historyCanRedo() {},
                    historyCanUndo() {},

                    historyPauseSteps() {},
                    historyUnpauseSteps() {},

                    historyResetLatestComputedSelection() {},
                    historyRevertCurrentStep() {},

                    automaticStepSkipStack() {},
                    automaticStepActive() {},
                    automaticStepUnactive() {},

                    observerActive() {},
                    observerUnactive() {},
                    sanitize() {},

                    unbreakableStepUnactive() {},
                },
            },
        };
        return {
            bus: new EventBus(),
            folded: false,
            options,
            setCSSVariables: (element) => {
                const stylesToCopy = weUtils.EDITOR_COLOR_CSS_VARIABLES;

                for (const style of stylesToCopy) {
                    let value = weUtils.getCSSVariableValue(style);
                    if (value.startsWith("'") && value.endsWith("'")) {
                        // Gradient values are recovered within a string.
                        value = value.substring(1, value.length - 1);
                    }
                    element.style.setProperty(`--we-cp-${style}`, value);
                }

                element.classList.toggle(
                    "o_we_has_btn_outline_primary",
                    weUtils.getCSSVariableValue("btn-primary-outline") === "true"
                );
                element.classList.toggle(
                    "o_we_has_btn_outline_secondary",
                    weUtils.getCSSVariableValue("btn-secondary-outline") === "true"
                );
            },
            trigger_up: (ev) => this._trigger_up(ev),
        };
    }
    async onSelectMassMailingTemplate(templateInfos, templateHTML) {
        await this.updateValue(templateHTML);
        this.state.showMassMailingTemplateSelector = false;

        // todo: to implement addClass(themeParams.className);
        // this.wysiwyg.$iframeBody
        //     .closest("body")
        //     .removeClass(this._themeClassNames)
        //     .addClass(themeParams.className);

        // todo: to implement: this.fieldConfig.selectedTheme = templateInfos;
        // this.fieldConfig.selectedTheme = templateInfos;

        // todo: to implement: setSnippetsMenuFolded
        // this.wysiwyg.setSnippetsMenuFolded(uiUtils.isSmall() || themeName === "basic");

        // todo: to implement templateInfos.name === "basic" && this.wysiwyg.$editable[0].focus();
        // if (templateInfos.name === "basic") {
        //     this.wysiwyg.$editable[0].focus();
        // }

        // todo: to implement: commitChanges
        // The value of the field gets updated upon editor blur. If for any
        // reason, the selection was not in the editable before modifying
        // another field, ensure that the value is properly set.
        // await this.commitChanges();
    }

    // -----------------------------------------------------------------------------
    // Legacy compatibility layer
    // Remove me when all legacy widgets using wysiwyg are converted to OWL.
    // -----------------------------------------------------------------------------
    _trigger_up(ev) {
        const evType = ev.name;
        const payload = ev.data;
        if (evType === "call_service") {
            this._callService(payload);
        }
    }
    _callService(payload) {
        const service = this.env.services[payload.service];
        const result = service[payload.method].apply(service, payload.args || []);
        payload.callback(result);
    }

    get wysiwygProps() {
        const props = super.wysiwygProps;
        return {
            ...props,
            contentClass: "o_in_iframe",
            iframe: true,
            onIframeLoaded: async (doc, editor) => {
                this.state.iframeDocument = doc;
                doc.body.classList.add("editor_enable");
                doc.body.classList.add("o_mass_mailing_iframe");
                const iframeBundle = await this.iframeBundle;
                const massMailingBundle = await this.massMailingBundle;
                function addStyle(href) {
                    const link = doc.createElement("link");
                    link.rel = "stylesheet";
                    link.href = href;
                    doc.head.appendChild(link);
                }
                function addScript(src) {
                    const script = doc.createElement("script");
                    script.type = "text/javascript";
                    script.src = src;
                    doc.head.appendChild(script);
                }
                addStyle(iframeBundle.cssLibs[0]);
                addStyle(massMailingBundle.cssLibs[0]);
                addScript(iframeBundle.jsLibs[0]);
                doc.body.classList.add("o_in_iframe");
                const editable = doc.createElement("div");
                doc.body.append(editable);
                editor.attachTo(editable);

                // todo: should this be in its own plugin? DRAG BUILDING BLOCKS HERE
                const subEditable = this.editor.editable.querySelector(".o_editable");
                if (subEditable) {
                    if (subEditable.getAttribute("data-editor-message") === null) {
                        subEditable.setAttribute(
                            "data-editor-message",
                            "DRAG BUILDING BLOCKS HERE"
                        );
                    }
                    subEditable.setAttribute("contenteditable", false);
                }
            },
            // copyCss: true,
        };
    }
}

export const massMailingHtmlField = {
    // ...htmlField,
    component: MassMailingHtmlField,
    additionalClasses: ["o_field_html"],

    // displayName: _t("Email"),
    // supportedOptions: [...htmlField.supportedOptions, {
    //     label: _t("Filter templates"),
    //     name: "filterTemplates",
    //     type: "boolean"
    // }, {
    //     label: _t("Inline field"),
    //     name: "inline-field",
    //     type: "field"
    // }],
    extractProps({ attrs, options }) {
        const props = htmlField.extractProps(...arguments);
        props.filterTemplates = Boolean(options.filterTemplates);
        //     props.inlineField = options['inline-field'];
        //     props.iframeHtmlClass = attrs.iframeHtmlClass;
        return props;
    },
    // fieldDependencies: [{ name: 'body_html', type: 'html', readonly: 'false' }],
};

registry.category("fields").add("mass_mailing_html", massMailingHtmlField);
