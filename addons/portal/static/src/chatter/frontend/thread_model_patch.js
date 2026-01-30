import { Thread } from "@mail/core/common/thread_model";

import { patch } from "@web/core/utils/patch";
import { rpc } from "@web/core/network/rpc";

const PORTAL_FETCH_LIMIT = (() => {
    const el = document.querySelector(".o_portal_chatter");
    return el ? parseInt(el.getAttribute("data-pager_step")) || 3 : null;
})();

patch(Thread.prototype, {
    setup() {
        super.setup(...arguments);
        /** @type {boolean|undefined} */
        this.hasReadAccess;
    },
    get effectiveSelf() {
        if (this.portal_partner && !this.store.self_user?.partner_id) {
            return this.portal_partner;
        }
        return super.effectiveSelf;
    },
    get rpcParams() {
        return {
            ...super.rpcParams,
            ...(this.access_token ? { token: this.access_token } : {}),
            ...(this.hash ? { hash: this.hash } : {}),
            ...(this.pid ? { pid: this.pid } : {}),
        };
    },
    get _fetchLimit() {
        return PORTAL_FETCH_LIMIT ?? this.store.FETCH_LIMIT;
    },
    async fetchMessagesData({ after, around, before } = {}) {
        const limit = this._fetchLimit;
        return await rpc(this.getFetchRoute(), {
            ...this.getFetchParams(),
            fetch_params: {
                limit: !around && around !== 0 ? limit : limit * 2,
                after,
                around,
                before,
            },
        });
    },
    async fetchMoreMessages(epoch = "older") {
        if (
            this.status === "loading" ||
            (epoch === "older" && !this.loadOlder) ||
            (epoch === "newer" && !this.loadNewer)
        ) {
            return;
        }
        const before = epoch === "older" ? this.oldestPersistentMessage?.id : undefined;
        const after = epoch === "newer" ? this.newestPersistentMessage?.id : undefined;
        let fetched = [];
        try {
            fetched = await this.fetchMessages({ after, before });
        } catch {
            return;
        }
        if (
            (after !== undefined && !this.messages.some((message) => message.id === after)) ||
            (before !== undefined && !this.messages.some((message) => message.id === before))
        ) {
            return;
        }
        const alreadyKnownMessages = new Set(this.messages.map(({ id }) => id));
        const messagesToAdd = fetched.filter((message) => !alreadyKnownMessages.has(message.id));
        if (epoch === "older") {
            this.messages.unshift(...messagesToAdd);
        } else {
            this.messages.push(...messagesToAdd);
        }
        if (fetched.length < this._fetchLimit) {
            if (epoch === "older") {
                this.loadOlder = false;
            } else if (epoch === "newer") {
                this.loadNewer = false;
                const missingMessages = this.pendingNewMessages.filter(
                    ({ id }) => !alreadyKnownMessages.has(id)
                );
                if (missingMessages.length > 0) {
                    this.messages.push(...missingMessages);
                    this.messages.sort((m1, m2) => m1.id - m2.id);
                }
            }
        }
        this._enrichMessagesWithTransient();
        this.pendingNewMessages = [];
    },
    async fetchNewMessages() {
        if (
            this.status === "loading" ||
            (this.isLoaded && ["discuss.channel", "mail.box"].includes(this.model))
        ) {
            return;
        }
        const after = this.isLoaded ? this.newestPersistentMessage?.id : undefined;
        let fetched = [];
        try {
            fetched = await this.fetchMessages({ after });
        } catch {
            return;
        }
        let startIndex;
        if (after === undefined) {
            startIndex = 0;
        } else {
            const afterIndex = this.messages.findIndex((message) => message.id === after);
            if (afterIndex === -1) {
                return;
            } else {
                startIndex = afterIndex + 1;
            }
        }
        const alreadyKnownMessages = new Set(this.messages.map((m) => m.id));
        const filtered = fetched.filter(
            (message) =>
                !alreadyKnownMessages.has(message.id) &&
                (this.persistentMessages.length === 0 ||
                    message.id < this.oldestPersistentMessage.id ||
                    message.id > this.newestPersistentMessage.id)
        );
        this.messages.splice(startIndex, 0, ...filtered);
        const limit = this._fetchLimit;
        Object.assign(this, {
            loadOlder:
                after === undefined && fetched.length === limit
                    ? true
                    : after === undefined && fetched.length !== limit
                    ? false
                    : this.loadOlder,
        });
    },
});
