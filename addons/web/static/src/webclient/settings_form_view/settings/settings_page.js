/** @odoo-module **/
import { ActionSwiper } from "@web/core/action_swiper/action_swiper";

import { Component, useState, useRef, useEffect } from "@odoo/owl";

export class SettingsPage extends Component {
    static template = "web.SettingsPage";
    static components = { ActionSwiper };
    static props = {
        modules: Array,
        initialTab: { type: String, optional: 1 },
        slots: Object,
    };

    setup() {
        this.state = useState({
            selectedTab: "",
            search: this.env.searchState,
        });

        if (this.props.modules) {
            this.state.selectedTab = this.props.initialTab || this.props.modules[0].key;
        }

        this.settingsRef = useRef("settings");
        this.settingsTabRef = useRef("settings_tab");
        this.scrollMap = Object.create(null);
        useEffect(
            (settingsEl, currentTab) => {
                if (!settingsEl) {
                    return;
                }

                const { scrollTop } = this.scrollMap[currentTab] || 0;
                settingsEl.scrollTop = scrollTop;
            },
            () => [this.settingsRef.el, this.state.selectedTab]
        );
    }

    getCurrentIndex() {
        return this.props.modules.findIndex((object) => {
            return object.key === this.state.selectedTab;
        });
    }

    hasRightSwipe() {
        return (
            this.env.isSmall && this.state.search.value.length === 0 && this.getCurrentIndex() !== 0
        );
    }
    hasLeftSwipe() {
        return (
            this.env.isSmall &&
            this.state.search.value.length === 0 &&
            this.getCurrentIndex() !== this.props.modules.length - 1
        );
    }
    async onRightSwipe(prom) {
        this.state.selectedTab = this.props.modules[this.getCurrentIndex() - 1].key;
        await prom;
        this.scrollToSelectedTab();
    }
    async onLeftSwipe(prom) {
        this.state.selectedTab = this.props.modules[this.getCurrentIndex() + 1].key;
        await prom;
        this.scrollToSelectedTab();
    }

    scrollToSelectedTab() {
        const key = this.state.selectedTab;
        this.settingsTabRef.el
            .querySelector(`[data-key='${key}']`)
            .scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    onSettingTabClick(key) {
        if (this.settingsRef.el) {
            const { scrollTop } = this.settingsRef.el;
            this.scrollMap[this.state.selectedTab] = { scrollTop };
        }
        this.state.selectedTab = key;
        this.env.searchState.value = "";
    }
}
