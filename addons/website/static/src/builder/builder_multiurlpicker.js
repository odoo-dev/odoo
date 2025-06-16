import { Plugin } from "@html_editor/plugin";
import { BuilderComponent } from "@html_builder/core/building_blocks/builder_component";
import {
    BuilderTextInputBase,
    textInputBasePassthroughProps,
} from "@html_builder/core/building_blocks/builder_text_input_base";
import {
    basicContainerBuilderComponentProps,
    useBuilderComponent,
    useInputBuilderComponent,
} from "@html_builder/core/utils";
import { Component, useEffect } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useChildRef } from "@web/core/utils/hooks";
import { pick } from "@web/core/utils/objects";
import wUtils from "@website/js/utils";

export class BuilderMultiUrlPicker extends Component {
    static template = "website.BuilderMultiUrlPicker";
    static props = {
        ...basicContainerBuilderComponentProps,
        ...textInputBasePassthroughProps,
    };
    static components = {
        BuilderComponent,
        BuilderTextInputBase,
    };

    setup() {
        useBuilderComponent();
        const { state, commit, preview } = useInputBuilderComponent({
            id: this.props.id,
            defaultValue: this.props.default,
            formatRawValue: this.formatRawValue.bind(this),
            parseDisplayValue: this.parseDisplayValue.bind(this),
        });
        this.commit = commit;
        this.preview = preview;
        this.state = state;
        this.inputRef = useChildRef();
        this.removeUrl = this.removeUrl.bind(this);

        useEffect(
            (inputEl) => {
                if (!inputEl) {
                    return;
                }
                const unmountAutocompleteWithPages = wUtils.autocompleteWithPages(
                    inputEl,
                    {
                        classes: {
                            "ui-autocomplete": "o_website_ui_autocomplete",
                        },
                        body: this.env.getEditingElement().ownerDocument.body,
                        urlChosen: () => {
                            const url = this.inputRef.el.value;
                            const selectedUrls = this.urls;
                            this.inputRef.el.value = ""; // clear the input

                            if (!url || selectedUrls.includes(url)) {
                                return;
                            }

                            selectedUrls.push(url);
                            this.commit(selectedUrls);
                        },
                    },
                    this.env
                );
                return () => unmountAutocompleteWithPages();
            },
            () => [this.inputRef.el]
        );
    }

    /**
     * @param {String} rawValue - Raw stringified list of URLs.
     * @returns {String[]} Array of selected URLs.
     */
    formatRawValue(rawValue) {
        try {
            return JSON.parse(rawValue || "[]");
        } catch {
            return [];
        }
    }

    /**
     * @param {String[]} displayValue - Array of URLs to stringify.
     * @returns {String} JSON stringified representation of the URL list.
     */
    parseDisplayValue(displayValue) {
        return JSON.stringify(displayValue);
    }

    /**
     * Removes the given URL from the list and commits the updated value.
     *
     * @param {String} url - URL to remove.
     */
    removeUrl(url) {
        const selectedUrls = this.urls;
        const index = selectedUrls.indexOf(url);
        if (index === -1) {
            return;
        }
        selectedUrls.splice(index, 1);
        this.commit(selectedUrls);
    }

    /**
     * @returns {String[]} Array of URLs currently selected in the picker.
     */
    get urls() {
        return this.formatRawValue(this.state.value);
    }

    get textInputBaseProps() {
        return pick(this.props, ...Object.keys(textInputBasePassthroughProps));
    }
}

class MultiUrlPickerPlugin extends Plugin {
    static id = "multiUrlPickerPlugin";

    resources = {
        builder_components: {
            BuilderMultiUrlPicker,
        },
    };
}

registry.category("website-plugins").add(MultiUrlPickerPlugin.id, MultiUrlPickerPlugin);
