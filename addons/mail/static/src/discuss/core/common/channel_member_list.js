import { ImStatus } from "@mail/core/common/im_status";
import { ActionPanel } from "@mail/discuss/core/common/action_panel";
import { useSequential } from "@mail/utils/common/hooks";
import { Component, onWillUpdateProps, onWillStart, useRef, useState,useEffect } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { useAutofocus, useService } from "@web/core/utils/hooks";

export class ChannelMemberList extends Component {
    static components = { ImStatus, ActionPanel };
    static props = ["thread", "openChannelInvitePanel", "className?"];
    static template = "discuss.ChannelMemberList";

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.state = useState({
            searchTerm: "",
            searched: false,
            loading: false,
            lastSearchTerm: ""
        });
        this.searchRef = useRef("search");
        this.sequential = useSequential();
        useAutofocus({ refName: "search" });
        useEffect(() => {
            if (this.state.searched && this.state.searchTerm != this.state.lastSearchTerm) {
                if (this.state.searchTerm) {
                    this.props.thread.members = [];
                    this.search();
                } else {
                    this.clearSearch();
                }
            }
        }, () => [this.state.searchTerm, this.state.lastSearchTerm]);
        onWillStart(() => {
            if (this.props.thread.fetchMembersState === "not_fetched") {
                this.props.thread.fetchChannelMembers();
            }
        });
        onWillUpdateProps((nextProps) => {
            if (nextProps.thread.fetchMembersState === "not_fetched") {
                nextProps.thread.fetchChannelMembers();
            }

            if (this.props.thread && nextProps.thread.id !== this.props.thread.id) {
                this.clearSearch();
            }
        });
    }

    clearSearch() {
        this.state.searchTerm = "";
        this.state.searched = false;
        this.state.loading = false;
        this.state.lastSearchTerm = "";
    }

    get onlineSectionText() {
        return _t("Online - %(online_count)s", {
            online_count: this.props.thread.onlineMembers.length,
        });
    }

    get offlineSectionText() {
        return _t("Offline - %(offline_count)s", {
            offline_count: this.props.thread.offlineMembers.length,
        });
    }

    get showSearchResults() {
        return this.state.searched && this.state.searchTerm;
    }

    get noResultsFound() {
        return this.showSearchResults && this.props.thread.members.length === 0;
    }

    canOpenChatWith(member) {
        if (this.store.inPublicPage) {
            return false;
        }
        if (member.persona.type === "guest") {
            return false;
        }
        return true;
    }

    onClickAvatar(ev, member) {
        if (!this.canOpenChatWith(member)) {
            return;
        }
        this.store.openChat({ partnerId: member.persona.id });
    }

    onKeydownSearch(ev) {
        if (ev.key === "Enter") {
            this.search();
        }
    }

    async loadMembers({ searchTerm, channel_id } = {}) {
        if(!searchTerm || !channel_id){
            return;
        }

        const limit = 30;
        const data = await rpc("/discuss/channel/members/fetch", {
            limit,
            channel_id,
            search_term: searchTerm,
        });

        const rawMembers = data["discuss.channel.member"];
        if(!rawMembers) return;

        this.store.insert(data);
        const members = rawMembers.map(memberData => {
            return this.store["discuss.channel.member"].get(memberData.id);
        }).filter(Boolean);

        this.props.thread.members = members;
        return members;
    }

    async search() {
        if (!this.state.searchTerm) {
            this.clearSearch();
            return;
        }

        if (this.state.loading) {
            return;
        }

        const searchTerm = this.state.searchTerm.trim();        
        this.sequential(async () => {
            this.state.loading = true;
            this.props.thread.members = [];
            try {
                await this.loadMembers({
                    searchTerm: searchTerm,
                    channel_id: this.props.thread.id,
                });

                this.state.lastSearchTerm = searchTerm;
                this.state.searched = true;
            } finally {
                this.state.loading = false;
            }
        });
    }
}
