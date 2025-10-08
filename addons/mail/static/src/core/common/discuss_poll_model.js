import { fields } from "@mail/model/misc";
import { Record } from "@mail/model/record";

import { rpc } from "@web/core/network/rpc";
import { user } from "@web/core/user";

export class DiscussPollModel extends Record {
    static id = "id";
    static _name = "discuss.poll";

    /** @type {boolean|undefined} */
    allow_multiple_options;
    create_date = fields.Datetime();
    /** @type {number|undefined} */
    create_uid;
    /** @type {number|undefined} */
    poll_duration;
    end_message_id = fields.One("mail.message");
    /** @type {number[undefined]} */
    id;
    option_ids = fields.Many("discuss.poll.option");
    /** @type {string|undefined} */
    poll_question;
    start_message_id = fields.One("mail.message");
    winning_option_id = fields.One("discuss.poll.option");

    get endDateTime() {
        return this.create_date.plus({ minutes: this.poll_duration });
    }

    get numberOfVotes() {
        return this.option_ids.reduce((sum, option) => sum + option.number_of_votes, 0);
    }

    get selfAlreadyVoted() {
        return this.option_ids.some((option) => option.selected_by_self);
    }

    get createdBySelf() {
        return this.create_uid === user.userId;
    }

    async vote(optionIds) {
        await rpc("/discuss/poll/vote", { poll_id: this.id, option_ids: optionIds });
    }

    removeVote() {
        rpc("/discuss/poll/remove_vote", { poll_id: this.id });
    }
}
DiscussPollModel.register();
