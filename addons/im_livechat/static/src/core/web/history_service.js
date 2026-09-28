import { BusPlugin } from "@bus/services/bus_plugin";
import { usePlugin } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

const HISTORY_REQUEST_TIMEOUT = 10_000;

export class HistoryService {
    busPlugin = usePlugin(BusPlugin);
    constructor(env, services) {
        /** @type {import("models").Store} */
        this.store = services["mail.store"];
        this.requestTimeouts = new Map();
    }

    setup() {
        this.busPlugin.subscribe("im_livechat.history/response", (payload) => {
            const { channel_id, page_history, request_id } = payload;
            const channel = this.store["discuss.channel"].get(channel_id);
            if (!channel || channel.livechatVisitorHistoryRequestId !== request_id) {
                return;
            }
            this.clearRequestTimeout(request_id);
            channel.livechatVisitorHistory = page_history;
            channel.livechatVisitorHistoryStatus = page_history.length ? "ready" : "empty";
        });
    }

    /** @param {string} requestId */
    clearRequestTimeout(requestId) {
        clearTimeout(this.requestTimeouts.get(requestId));
        this.requestTimeouts.delete(requestId);
    }

    /**
     * @param {import("models").DiscussChannel} channel
     * @param {string} requestId
     */
    failRequest(channel, requestId) {
        if (channel.livechatVisitorHistoryRequestId !== requestId) {
            return;
        }
        this.clearRequestTimeout(requestId);
        channel.livechatVisitorHistoryStatus = "error";
    }

    /** @param {import("models").DiscussChannel} channel */
    async request(channel) {
        if (channel.livechat_end_dt) {
            if (!["ready", "empty"].includes(channel.livechatVisitorHistoryStatus)) {
                channel.livechatVisitorHistoryStatus = "unavailable";
            }
            return;
        }
        if (channel.livechatVisitorHistoryRequestId) {
            this.clearRequestTimeout(channel.livechatVisitorHistoryRequestId);
        }
        const requestId = window.crypto.randomUUID();
        channel.livechatVisitorHistoryRequestId = requestId;
        channel.livechatVisitorHistoryStatus = "loading";
        this.requestTimeouts.set(
            requestId,
            setTimeout(() => this.failRequest(channel, requestId), HISTORY_REQUEST_TIMEOUT)
        );
        try {
            const requested = await rpc("/im_livechat/session/history/request", {
                channel_id: channel.id,
                request_id: requestId,
            });
            if (!requested) {
                this.failRequest(channel, requestId);
            }
        } catch {
            this.failRequest(channel, requestId);
        }
    }
}

export const historyService = {
    dependencies: ["bus_service", "mail.store"],
    start(env, services) {
        const history = new HistoryService(env, services);
        history.setup();
        return history;
    },
};

registry.category("services").add("im_livechat.history", historyService);
