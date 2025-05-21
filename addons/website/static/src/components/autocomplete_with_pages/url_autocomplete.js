import { Component } from "@odoo/owl";
import { useSuggester } from "@web/core/autocomplete/suggester_hook";
import { rpc } from "@web/core/network/rpc";
import { useChildRef } from "@web/core/utils/hooks";
import { AutoCompleteWithPages } from "@website/components/autocomplete_with_pages/autocomplete_with_pages";

export class UrlAutoComplete extends Component {
    static props = {
        options: { type: Object },
        loadAnchors: { type: Function },
        targetDropdown: { type: HTMLElement },
    };
    static template = "website.UrlAutoComplete";
    static components = { AutoCompleteWithPages };

    setup() {
        this.inputRef = useChildRef();

        const suggest = useSuggester(this.loadLinks.bind(this));
        this.urlSource = {
            options: suggest,
        };
    }

    get dropdownClass() {
        const classList = [];
        for (const key in this.props.options?.classes) {
            classList.push(key, this.props.options.classes[key]);
        }
        return classList.join(" ")
    }

    get dropdownOptions() {
        const options = {};
        if (this.props.options?.position) {
            options.position = this.props.options?.position;
        }
        return options;
    }

    async loadLinks(term, lock) {
        const makeItem = (item) => ({
            cssClass: "ui-autocomplete-item",
            data: item,
            label: item.label,
            onSelect: this.onSelect.bind(this, item.value),
            slotName: "item",
        });
        if (term[0] === "#") {
            const anchors = await lock(this.props.loadAnchors(
                term,
                this.props.options && this.props.options.body
            ));
            return anchors.map((anchor) => makeItem({ label: anchor, value: anchor }));
        } else if (term.startsWith("http") || term.length === 0) {
            // avoid useless call to /website/get_suggested_links
            return [];
        }

        const res = await lock(rpc("/website/get_suggested_links", {
            needle: term,
            limit: 15,
        }));
        const choices = [];
        for (const page of res.matching_pages) {
            choices.push(makeItem(page));
        }
        for (const other of res.others) {
            if (other.values.length) {
                choices.push({
                    cssClass: "ui-autocomplete-category",
                    data: { separator: true },
                    label: other.title,
                    slotName: "category",
                });
                for (const page of other.values) {
                    choices.push(makeItem(page));
                }
            }
        }
        return choices;
    }

    onSelect(value) {
        this.inputRef.value = value;
        this.props.targetDropdown.value = value;
        this.props.options.urlChosen?.();
    }

    onInput({ inputValue }) {
        this.props.targetDropdown.value = inputValue;
    }
}
