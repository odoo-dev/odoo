import { Record } from "@mail/model/record";

export class DiscussPollModel extends Record {
    static id = "id";
    static _name = "discuss.poll";

    /** @type {number} */
    id;
    message_id = Record.one("mail.message");
    /** @type {string} */
    question;
    answer_ids = Record.many("discuss.poll.answer");

    get numberOfVotes() {
        let result = 0;
        for (const answer of this.answer_ids) {
            result += answer.voting_partner_ids.length;
        }
        return result;
    }
}
DiscussPollModel.register();
