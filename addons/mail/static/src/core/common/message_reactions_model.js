import { AND, Record } from "@mail/core/common/record";
import { rpc } from "@web/core/network/rpc";
import { user } from "@web/core/user";

export class MessageReactions extends Record {
    static id = AND("message", "content");
    /** @returns {import("models").MessageReactions} */
    static get(data) {
        return super.get(data);
    }
    /** @returns {import("models").MessageReactions|import("models").MessageReactions[]} */
    static insert(data) {
        return super.insert(...arguments);
    }

    /** @type {string} */
    content;
    /** @type {number} */
    count;
    /** @type {number} */
    sequence;
    personas = Record.many("Persona");
    message = Record.one("Message");

    async remove() {
        this.store.insert(
            await rpc(
                "/mail/message/reaction",
                {
                    action: "remove",
                    content: this.content,
                    context: user.context,
                    message_id: this.message.id,
                    ...this.message.thread.rpcParams,
                },
                { silent: true }
            )
        );
    }
}

MessageReactions.register();
