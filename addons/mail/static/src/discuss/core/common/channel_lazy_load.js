import { Component, onWillStart } from "@odoo/owl";
import { useState } from "@web/owl2/utils";
import { useService } from "@web/core/utils/hooks";
import { rpc } from "@web/core/network/rpc";
import { useOnBottomScrolled } from "@mail/utils/common/hooks";
import { DiscussSidebarChannel } from "@mail/discuss/core/public_web/discuss_app/sidebar/channel";
import { ActionPanel } from "./action_panel";

/**
 * @typedef {Object} Props
 * @property {import("models").DiscussAppCategory} category
 * @extends {Component<Props, Env>}
 */
export class ChannelLazyLoad extends Component {
    static template = "mail.ChannelLazyLoad";
    static props = ["category"];
    static components = { ActionPanel, DiscussSidebarChannel };

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.pageSize = 30;
        this.state = useState({
            hasMore: true,
            loading: false,
        });
        onWillStart(() => this.loadMore());
        useOnBottomScrolled("scroll", () => this.loadMore());
    }

    async loadMore() {
        if (this.state.loading || !this.state.hasMore || !this.props.category.technical_key) {
            return;
        }
        try {
            this.state.loading = true;
            const { channel_ids, store_data } = await rpc("/discuss/channel/lazy_fetch", {
                technical_key: this.props.category.technical_key,
                known_channel_ids: this.props.category.channels.map((c) => c.id),
                limit: this.pageSize,
            });
            this.store.insert(store_data);
            this.state.hasMore = channel_ids.length === this.pageSize;
        } finally {
            this.state.loading = false;
        }
    }
}
