import { onWillRender, useChildSubEnv, useLayoutEffect, useState } from "@web/owl2/utils";
import { HighlightText } from "../highlight_text/highlight_text";

import { Component, signal } from "@odoo/owl";
import { normalize } from "@web/core/l10n/utils";

export class SettingsBlock extends Component {
    static template = "web.SettingsBlock";
    static components = {
        HighlightText,
    };
    static props = {
        title: { type: String, optional: true },
        tip: { type: String, optional: true },
        slots: { type: Object, optional: true },
        class: { type: String, optional: true },
    };
    settingsContainerRef = signal(null);
    settingsContainerTitleRef = signal(null);
    settingsContainerTipRef = signal(null);
    setup() {
        this.state = useState({
            search: this.env.searchState,
        });
        this.showAllContainerState = useState({
            showAllContainer: false,
        });
        useChildSubEnv({
            showAllContainer: this.showAllContainerState,
        });
        useLayoutEffect(
            () => {
                const containerEl = this.settingsContainerRef();
                if (!containerEl) {
                    return;
                }
                const force =
                    this.state.search.value &&
                    !normalize([this.props.title, this.props.tip].join()).includes(
                        this.state.search.value
                    ) &&
                    !containerEl.querySelector(
                        ".o_setting_box.o_searchable_setting"
                    );
                this.toggleContainer(force);
            },
            () => [this.state.search.value, this.settingsContainerRef()]
        );
        onWillRender(() => {
            if (
                normalize([this.props.title, this.props.tip].join()).includes(
                    this.state.search.value
                )
            ) {
                this.showAllContainerState.showAllContainer = true;
            } else {
                this.showAllContainerState.showAllContainer = false;
            }
        });
    }
    toggleContainer(force) {
        const titleEl = this.settingsContainerTitleRef();
        if (titleEl) {
            titleEl.classList.toggle("d-none", force);
        }
        const tipEl = this.settingsContainerTipRef();
        if (tipEl) {
            tipEl.classList.toggle("d-none", force);
        }
        const containerEl = this.settingsContainerRef();
        if (containerEl) {
            containerEl.classList.toggle("d-none", force);
        }
    }
}
