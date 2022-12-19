/* @odoo-module */

import { useMessaging } from "../messaging_hook";
import { TagsList } from "@web/views/fields/many2many_tags/tags_list";
import { NavigableList } from "../composer/navigable_list";
import { useService } from "@web/core/utils/hooks";
import { getActiveHotkey } from "@web/core/hotkeys/hotkey_service";
import { Component, onMounted, useRef, useState } from "@odoo/owl";
import { cleanTerm } from "@mail/new/utils/format";
import { Partner } from "../core/partner_model";
import { _t } from "@web/core/l10n/translation";

export class ChannelSelector extends Component {
    static components = { TagsList, NavigableList };
    static props = ["category", "onValidate?", "autofocus?"];
    static template = "mail.channel_selector";

    setup() {
        this.messaging = useMessaging();
        this.orm = useService("orm");
        this.state = useState({
            value: "",
            selectedPartners: [],
        });
        this.inputRef = useRef("input");
        this.rootRef = useRef("root");
        if (this.props.autofocus) {
            onMounted(() => this.inputRef.el.focus());
        }
    }

    async fetchSuggestions(term) {
        const cleanedTerm = cleanTerm(term);
        if (cleanedTerm) {
            if (this.props.category.id === "channels") {
                const domain = [
                    ["channel_type", "=", "channel"],
                    ["name", "ilike", cleanedTerm],
                ];
                const fields = ["name"];
                const results = await this.orm.searchRead("mail.channel", domain, fields, {
                    limit: 10,
                });
                const choices = results.map((channel) => {
                    return {
                        channelId: channel.id,
                        classList: "o-mail-channel-selector-suggestion",
                        label: channel.name,
                    };
                });
                choices.push({
                    channelId: "__create__",
                    classList: "o-mail-channel-selector-suggestion",
                    label: cleanedTerm,
                });
                return choices;
            }
            if (this.props.category.id === "chats") {
                const results = await this.orm.call("res.partner", "im_search", [
                    cleanedTerm,
                    10,
                    this.state.selectedPartners,
                ]);
                return results.map((data) => {
                    Partner.insert(this.messaging.state, data);
                    return {
                        classList: "o-mail-channel-selector-suggestion",
                        label: data.name,
                        partner: data,
                    };
                });
            }
        }
        return [];
    }

    onSelect(option) {
        if (this.props.category.id === "channels") {
            if (option.channelId === "__create__") {
                this.messaging.createChannel(option.label);
            } else {
                this.messaging.joinChannel(option.channelId, option.label);
            }
            this.onValidate();
        }
        if (this.props.category.id === "chats") {
            if (!this.state.selectedPartners.includes(option.partner.id)) {
                this.state.selectedPartners.push(option.partner.id);
            }
            this.state.value = "";
        }
    }

    async onValidate() {
        if (this.props.category.id === "chats") {
            const selectedPartners = this.state.selectedPartners;
            if (selectedPartners.length === 0) {
                return;
            }
            if (selectedPartners.length === 1) {
                await this.messaging
                    .joinChat(selectedPartners[0])
                    .then((chat) => this.messaging.setDiscussThread(chat.localId));
            } else {
                const partners_to = [
                    ...new Set([this.messaging.state.user.partnerId, ...selectedPartners]),
                ];
                await this.messaging.createGroupChat({ partners_to });
            }
        }
        if (this.props.onValidate) {
            this.props.onValidate();
        }
    }

    onKeydownInput(ev) {
        const hotkey = getActiveHotkey(ev);
        switch (hotkey) {
            case "enter":
                if (!this.state.value === "") {
                    return;
                }
                this.onValidate();
                break;
            case "backspace":
                if (this.state.selectedPartners.length > 0 && this.state.value === "") {
                    this.state.selectedPartners.pop();
                }
                return;
            default:
                return;
        }
        ev.stopPropagation();
        ev.preventDefault();
    }

    removeFromSelectedPartners(id) {
        this.state.selectedPartners = this.state.selectedPartners.filter(
            (partnerId) => partnerId !== id
        );
        this.inputRef.el.focus();
    }

    get inputPlaceholder() {
        return this.state.selectedPartners.length > 0
            ? _t("Press Enter to start")
            : this.props.category.addTitle;
    }

    get tagsList() {
        const res = [];
        for (const partnerId of this.state.selectedPartners) {
            const partner = this.messaging.state.partners[partnerId];
            res.push({
                id: partner.id,
                text: partner.name,
                className: "m-1 py-1",
                colorIndex: Math.floor(partner.name.length % 10),
                onDelete: () => this.removeFromSelectedPartners(partnerId),
            });
        }
        return res;
    }

    get navigableListProps() {
        return {
            anchorRef: this.rootRef.el,
            position: "bottom",
            onSelect: (ev, option) => this.onSelect(option),
            sources: [
                {
                    placeholder: "Loading",
                    optionTemplate:
                        this.props.category.id === "channels"
                            ? "mail.channel_selector.channel"
                            : "mail.channel_selector.chat",
                    options: this.fetchSuggestions(this.state.value),
                },
            ],
        };
    }
}
