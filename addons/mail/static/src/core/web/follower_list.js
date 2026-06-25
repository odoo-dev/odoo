import { Component, props, types, onMounted, onWillUnmount } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useLayoutEffect, useRef } from "@web/owl2/utils";
import { useService } from "@web/core/utils/hooks";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { DropdownState } from "@web/core/dropdown/dropdown_hooks";
import { Follower } from "@mail/core/web/follower";
import { FollowerSubtypeDialog } from "@mail/core/web/follower_subtype_dialog";
import { SearchInput } from "@mail/core/common/search_input";
import { useSearch } from "@mail/utils/common/hooks";
import { browser } from "@web/core/browser/browser";

const DEFAULT_SEARCH_THRESHOLD = 100;

export class FollowerList extends Component {
    static template = "mail.FollowerList";
    static components = { DropdownItem, Follower, SearchInput };

    setup() {
        super.setup();
        this.action = useService("action");
        this.store = useService("mail.store");
        this.listRef = useRef("follower-list");
        this.pendingScrollAnchor = null;
        this.scrollContainer = null;
        this.isLoadingMoreFollowers = false;
        this.suppressScrollLoad = false;
        this.onScrollFollowers = () => {
            if (!this.scrollContainer || this.suppressScrollLoad || this.isLoadingMoreFollowers) {
                return;
            }
            const { scrollTop, clientHeight, scrollHeight } = this.scrollContainer;
            if (Math.abs(scrollTop + clientHeight - scrollHeight) > 1) {
                return;
            }
            this.onLoadMoreFollowers();
        };
        this.props = props({
            dropdown: types.instanceOf(DropdownState),
            onAddFollowers: types.function([]).optional(),
            onFollowerChanged: types.function([]).optional(),
            thread: types.instanceOf(this.store["mail.thread"].Class),
        });
        this.search = useSearch({
            fetch: async (term) => {
                await this.props.thread.reloadFollowers(term);
                return this.props.thread.followers.length > 0;
            },
            deps: () => [this.props.thread],
        });
        useLayoutEffect(
            () => {
                if (!this.pendingScrollAnchor || !this.listRef.el) {
                    return;
                }
                const { followerId } = this.pendingScrollAnchor;
                browser.requestAnimationFrame(() => {
                    const list = this.listRef.el;
                    if (!list || !this.pendingScrollAnchor) {
                        return;
                    }
                    const follower = list.querySelector(`[data-follower-id="${followerId}"]`);
                    if (!follower) {
                        this.pendingScrollAnchor = null;
                        return;
                    }
                    this.suppressScrollLoad = true;
                    follower.scrollIntoView({ behavior: "instant", block: "end" });
                    this.pendingScrollAnchor = null;
                    browser.requestAnimationFrame(() => {
                        this.suppressScrollLoad = false;
                    });
                });
            },
            () => [this.props.thread.followers.length]
        );
        onMounted(() => {
            this.scrollContainer = this.listRef.el?.closest(".o-mail-Followers-dropdown");
            this.scrollContainer?.addEventListener("scroll", this.onScrollFollowers);
        });
        onWillUnmount(() => {
            this.scrollContainer?.removeEventListener("scroll", this.onScrollFollowers);
        });
    }

    get canSearchFollowers() {
        return (
            this.props.thread.followersCount >
            (this.props.thread.followersSearchThreshold ?? DEFAULT_SEARCH_THRESHOLD)
        );
    }

    get inputPlaceholder() {
        return _t("Search followers by name or email");
    }

    get isSearchingFollowers() {
        return !!this.search.searchTerm;
    }

    get showNoFollowers() {
        return this.props.thread.followers.length === 0 && !this.isSearchingFollowers;
    }

    get showLoadMoreFollowers() {
        return !!this.props.thread.followersHasMore;
    }

    async clearSearch() {
        this.pendingScrollAnchor = null;
        this.search.reset();
        await this.props.thread.reloadFollowers("");
    }

    async onLoadMoreFollowers() {
        if (this.isLoadingMoreFollowers) {
            return;
        }
        this.isLoadingMoreFollowers = true;
        const list = this.listRef.el;
        const follower = this.props.thread.followers.at(-1);
        if (list && follower) {
            const followerEl = list.querySelector(`[data-follower-id="${follower.id}"]`);
            if (followerEl) {
                // Keep the last visible follower anchored after the next page is appended.
                this.pendingScrollAnchor = {
                    followerId: follower.id,
                };
            }
        }
        try {
            await this.props.thread.loadMoreFollowers(this.search.searchTerm);
        } finally {
            this.isLoadingMoreFollowers = false;
        }
    }

    onClickAddFollowers() {
        const action = {
            type: "ir.actions.act_window",
            res_model: "mail.followers.edit",
            view_mode: "form",
            views: [[false, "form"]],
            name: _t("Add followers to this document"),
            target: "new",
            context: {
                default_res_model: this.props.thread.model,
                default_res_ids: [this.props.thread.id],
                dialog_size: "medium",
                form_view_ref: "mail.mail_followers_list_edit_form",
            },
        };
        this.action.doAction(action, {
            onClose: () => {
                this.props.onAddFollowers?.();
            },
        });
    }

    async onClickFollow() {
        const { thread } = this.props;
        await thread.follow();
        this.props.onFollowerChanged?.(thread);
    }

    async onClickUnfollow() {
        const { thread } = this.props;
        if (thread.selfFollower) {
            await thread.selfFollower.remove();
            this.props.onFollowerChanged?.(thread);
        }
    }

    async onClickEdit() {
        this.env.services.dialog.add(FollowerSubtypeDialog, {
            follower: this.props.thread.selfFollower,
            onFollowerChanged: (thread) => this.props.onFollowerChanged?.(thread),
        });
        this.props.dropdown.close();
    }
}
