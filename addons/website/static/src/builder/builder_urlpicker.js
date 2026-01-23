import { BuilderUrlPicker } from "@html_builder/core/building_blocks/builder_urlpicker";
import { patch } from "@web/core/utils/patch";
import { useChildRef } from "@web/core/utils/hooks";
import { AutoComplete } from "@web/core/autocomplete/autocomplete";
import { rpc } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";
import wUtils from "@website/js/utils";

export class AutoCompleteInBuilderUrlPicker extends AutoComplete {
    static props = {
        ...AutoComplete.props,
        inputClass: { type: String, optional: true },
    };
    static template = "website.AutoCompleteInBuilderUrlPicker";

    get ulDropdownClass() {
        return `${super.ulDropdownClass} dropdown-menu ui-autocomplete o_website_ui_autocomplete`;
    }

    get inputClass() {
        return this.props.inputClass;
    }
}

patch(BuilderUrlPicker, {
    components: { ...BuilderUrlPicker.components, AutoCompleteInBuilderUrlPicker },
});

patch(BuilderUrlPicker.prototype, {
    setup() {
        super.setup();
        this.urlRef = useChildRef();
    },

    get sources() {
        return [this.optionsSource];
    },

    get optionsSource() {
        return {
            placeholder: _t("Loading..."),
            options: this.loadOptionsSource.bind(this),
            optionSlot: "urlOption",
        };
    },

    async loadOptionsSource(term) {
        const makeItem = (item) => ({
            cssClass: "ui-autocomplete-item",
            label: item.label,
            onSelect: this.onSelect.bind(this, item.value),
            data: { icon: item.icon || false, isCategory: false },
        });

        if (term[0] === "#") {
            const body = this.env.getEditingElement?.()?.ownerDocument?.body;
            const anchors = await wUtils.loadAnchors(term, body);
            return anchors.map((anchor) => makeItem({ label: anchor, value: anchor }));
        } else if (term.startsWith("http") || term.length === 0) {
            // avoid useless call to /website/get_suggested_links
            return [];
        }

        const res = await rpc("/website/get_suggested_links", {
            needle: term,
            limit: 15,
        });
        const choices = [];
        for (const page of res.matching_pages) {
            choices.push(makeItem(page));
        }
        for (const other of res.others) {
            if (other.values.length) {
                choices.push({
                    cssClass: "ui-autocomplete-category",
                    label: other.title,
                    data: { icon: false, isCategory: true },
                });
                for (const page of other.values) {
                    choices.push(makeItem(page));
                }
            }
        }
        return choices;
    },

    onSelect(value) {
        this.urlRef.el.value = value;
        this.commit(value);
    },

    openPreviewUrl() {
        if (this.urlRef.el.value) {
            window.open(this.urlRef.el.value, "_blank");
        }
    },
});
