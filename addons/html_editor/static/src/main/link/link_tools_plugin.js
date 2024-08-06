import { Plugin } from "@html_editor/plugin";
import { reactive } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { effect } from "@web/core/utils/reactive";

export class LinkToolsPlugin extends Plugin {
    static name = "link_tools";
    static dependencies = ["link", "toolbar"];
    static shared = ["openLinkTools", "getLinktoolState"];
    /** @type { (p: LinkToolsPlugin) => Record<string, any> } */
    static resources = (p) => {
        p.buttonState = reactive({
            isActive: false,
        });
        return {
            mutation_filtered_classes: ["oe_edited_link"],
            toolbarCategory: {
                id: "link",
                sequence: 40,
            },
            toolbarItems: [
                {
                    id: "link",
                    category: "link",
                    action() {
                        p.toggleLinkTools();
                    },
                    icon: "fa-link",
                    name: _t("link-tool"),
                    state: p.buttonState,
                },
            ],
        };
    };

    setup() {
        this.state = reactive({
            linkToolProps: undefined,
        });
        effect(
            (state) => {
                this.buttonState.isActive = Boolean(state.linkToolProps);
            },
            [this.state]
        );
    }
    getLinktoolState() {
        return this.state;
    }

    toggleLinkTools() {
        if (this.state.linkToolProps) {
            this.closeLinkTools();
        } else {
            this.openLinkTools();
        }
    }

    abracadabraLinkTools() {
        // todo: check to adapt this code (shouldFocusUrl)
        // const shouldFocusUrl = options.shouldFocusUrl === undefined ? true : options.shouldFocusUrl;
        // if (
        //     options.link &&
        //     options.link.querySelector(mediaSelector) &&
        //     !options.link.textContent.trim() &&
        //     wysiwygUtils.isImg(this.lastElement)
        // ) {
        //     // If the link contains a media without text, the link is
        //     // editable in the media options instead.
        //     if (options.shoudFocusUrl) {
        //         // Wait for the editor panel to be fully updated.
        //         this.mutex.exec(() => {
        //             this.odooEditor.dispatchEvent(new Event("activate_image_link_tool"));
        //         });
        //     }
        //     return;
        // }
        // if (options.forceOpen || !this.state.linkToolProps) {
        //     this.openLinkTools();
        // } else {
        //     this.destroyLinkTools();
        // }
    }

    /**
     * @param {Object} [options]
     * @param {boolean} [options.shouldFocusUrl] If true, the url input will be
     * focused.
     */
    openLinkTools({ shouldFocusUrl } = {}) {
        // todo: adapt this code (link button state)
        // const $button = $(this.toolbarEl.querySelector("#create-link"));

        // todo: adapt this code (prevent opening linktool when already opened
        // on the same link or if one ancestor is the link of the current
        // linktool).
        // if (
        //     this.state.linkToolProps ||
        //     [options.link, ...ancestors(options.link)].includes(this.linkToolsInfos.link)
        // ) {
        //     return;
        // }

        const link = this.shared.getOrCreateLink();
        // const { link } = this.shared.getOrCreateLink({
        //     containerNode: this.odooEditor.editable,
        //     startNode: this.lastMediaClicked,
        // });
        // todo: adapt this code (link preview class oe_edited_link)
        // const addHintClasses = () => {
        //     link.classList.add("oe_edited_link");
        //     // todo: adapt this code (link button state)
        //     // $button.addClass("active");
        // };
        // const removeHintClasses = () => {
        //     link.classList.remove("oe_edited_link");
        //     // todo: adapt this code (link button state)
        //     // $button.removeClass("active");
        // };
        // this.linkToolsInfos = {
        //     link,
        //     removeHintClasses,
        // };
        // addHintClasses();
        const self = this;

        this.state.linkToolProps = {
            // ...this.options.linkOptions,
            wysiwyg: {
                odooEditor: {
                    observerUnactive() {},
                    observerActive() {},
                    get document() {
                        return self.document;
                    },
                    toggleLinkTools() {
                        console.warn("toggleLinkTools");
                    },
                    removeLink() {
                        console.warn("removeLink");
                    },

                    historyStep() {
                        self.dispatch("ADD_STEP");
                    },
                    execCommand() {
                        console.warn("execCommand");
                    },
                    historyPauseSteps() {
                        console.warn("historyPauseSteps");
                    },
                    historyUnpauseSteps() {
                        console.warn("historyUnpauseSteps");
                    },
                },
            },
            editable: this.editable,
            link,
            // If the link contains an image or an icon do not
            // display the label input (e.g. some mega menu links).
            needLabel: !link.querySelector(".fa, img"),
            shouldFocusUrl,
            onColorCombinationClassChange: (colorCombinationClass) => {
                // todo: adapt this code (colorCombinationClass)
                // this.linkToolsInfos.colorCombinationClass = colorCombinationClass;
            },
            // todo: adapt this code (link preview class oe_edited_link)
            // onPreApplyLink: removeHintClasses,
            // onPostApplyLink: addHintClasses,
            // onDestroy: removeHintClasses,
            getColorpickerTemplate: this.config.getColorpickerTemplatem,
        };
        // todo: adapt this code (focus on linktool)
        // // update the shouldFocusUrl prop to focus on url when double click and click edit link
        // this.state.linkToolProps.shouldFocusUrl = shouldFocusUrl;

        // this.bindOnClick();
    }
    closeLinkTools() {
        this.state.linkToolProps = undefined;
    }

    bindOnClick() {
        this.odooEditor.document.removeEventListener("click", this._onClick, true);
        document.removeEventListener("click", this._onClick, true);
        this._onClick = (ev) => {
            if (
                !ev.target.closest("#create-link") &&
                (!ev.target.closest(".oe-toolbar") ||
                    !ev.target.closest("we-customizeblock-option")) &&
                !ev.target.closest(".ui-autocomplete") &&
                (!this.state.linkToolProps ||
                    ![ev.target, ...wysiwygUtils.ancestors(ev.target)].includes(
                        this.linkToolsInfos.link
                    ))
            ) {
                // Destroy the link tools on click anywhere outside the
                // toolbar if the target is the orgiginal target not in the original target.
                this.destroyLinkTools();
                this.odooEditor.document.removeEventListener("click", this._onClick, true);
                document.removeEventListener("click", this._onClick, true);
            }
        };
        this.odooEditor.document.addEventListener("click", this._onClick, true);
        document.addEventListener("click", this._onClick, true);
    }
}
