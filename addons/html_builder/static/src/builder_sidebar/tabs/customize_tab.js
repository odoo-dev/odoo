import { Component, useState, useSubEnv } from "@odoo/owl";
import { OptionsContainer } from "../../components/option_container";
import { useVisibilityObserver } from "../../builder_components/utils";

export class CustomizeTab extends Component {
    static template = "html_builder.CustomizeTab";
    static components = { OptionsContainer };
    static props = {
        currentOptionsContainers: { type: Array, optional: true },
        snippetModel: { type: Object },
        iframeEl: { type: HTMLElement },
    };
    static defaultProps = {
        currentOptionsContainers: [],
    };

    setup() {
        this.state = useState({
            hasContent: true,
        });
        useVisibilityObserver("content", (hasContent) => {
            this.state.hasContent = hasContent;
        });
        useSubEnv({
            iframeEl: this.props.iframeEl,
        });
    }
}
