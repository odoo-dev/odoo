/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { Message } from "../core/message_model";
import { Thread } from "../core/thread_model";
import { createLocalId } from "../core/thread_model.create_local_id";

export class ChatterService {
    constructor(env, store, thread, rpc, orm) {
        this.env = env;
        /** @type {import("@mail/new/core/store_service").Store} */
        this.store = store;
        /** @type {import("@mail/new/thread/thread_service").ThreadService} */
        this.thread = thread;
        this.rpc = rpc;
        this.orm = orm;
    }

    async fetchData(
        resId,
        resModel,
        requestList = ["activities", "followers", "attachments", "messages"]
    ) {
        if (requestList.includes("messages")) {
            this.thread.fetchNewMessages(Thread.insert(this.store, { model: resModel, id: resId }));
        }
        const result = await this.rpc("/mail/thread/data", {
            request_list: requestList,
            thread_id: resId,
            thread_model: resModel,
        });
        if ("attachments" in result) {
            result["attachments"] = result["attachments"].map((attachment) => ({
                ...attachment,
                originThread: Thread.insert(this.store, attachment.originThread[0][1]),
            }));
        }
        return result;
    }

    getThread(resModel, resId) {
        const localId = createLocalId(resModel, resId);
        if (localId in this.store.threads) {
            if (resId === false) {
                return this.store.threads[localId];
            }
            // to force a reload
            this.store.threads[localId].status = "new";
        }
        const thread = Thread.insert(this.store, {
            id: resId,
            model: resModel,
            type: "chatter",
        });
        if (resId === false) {
            const tmpId = `virtual${this.nextId++}`;
            const tmpData = {
                id: tmpId,
                author: { id: this.store.user.partnerId },
                body: _t("Creating a new record..."),
                message_type: "notification",
                trackingValues: [],
            };
            Message.insert(this.store, tmpData, thread);
        }
        return thread;
    }

    /**
     * @param {import("@mail/new/core/follower_model").Follower} follower
     */
    async removeFollower(follower) {
        await this.orm.call(follower.followedThread.model, "message_unsubscribe", [
            [follower.followedThread.id],
            [follower.partner.id],
        ]);
        follower.delete();
    }
}

export const chatterService = {
    dependencies: ["mail.store", "mail.thread", "rpc", "orm"],
    start(env, { "mail.store": store, "mail.thread": thread, rpc, orm }) {
        return new ChatterService(env, store, thread, rpc, orm);
    },
};
