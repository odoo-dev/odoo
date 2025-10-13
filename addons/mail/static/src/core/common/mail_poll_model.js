import { fields } from "@mail/model/misc";
import { Record } from "@mail/model/record";

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { user } from "@web/core/user";

export class MailPollModel extends Record {
    static id = "id";
    static _name = "mail.poll";

    /** @type {boolean|undefined} */
    allow_multiple_options;
    create_date = fields.Datetime();
    /** @type {number|undefined} */
    create_uid;
    /** @type {number[undefined]} */
    id;
    end_message_id = fields.One("mail.message");
    poll_end_dt = fields.Datetime();
    /** @type {string|undefined} */
    poll_question;
    option_ids = fields.Many("mail.poll.option");
    start_message_id = fields.One("mail.message");
    winning_option_id = fields.One("mail.poll.option");

    get createdBySelf() {
        return this.create_uid === user.userId;
    }

    get remainingTimeText() {
        const diff = this.poll_end_dt.diffNow(["hours", "minutes", "seconds"]);
        if (diff.valueOf() <= 0) {
            return _t("Poll will end soon");
        }
        const hours = Math.ceil(diff.as("hours"));
        const minutes = Math.ceil(diff.as("minutes"));
        const seconds = Math.ceil(diff.as("seconds"));
        if (hours > 1) {
            return _t("%(hours)s hours left", { hours });
        }
        if (minutes > 1) {
            return _t("%(minutes)s minutes left", { minutes });
        }
        if (seconds === 1) {
            return _t("1 second left");
        }
        return _t("%(seconds)s seconds left", { seconds });
    }

    get numberOfVotes() {
        return this.option_ids.reduce((sum, option) => sum + option.number_of_votes, 0);
    }

    get selfAlreadyVoted() {
        return this.option_ids.some((option) => option.selected_by_self);
    }

    removeVote() {
        rpc("/mail/poll/remove_vote", { poll_id: this.id });
    }

    async vote(optionIds) {
        await rpc("/mail/poll/vote", { poll_id: this.id, option_ids: optionIds });
    }
}
MailPollModel.register();
