import { Record } from "@mail/model/record";

export class DiscussPollAnswerModel extends Record {
    static id = "id";
    static _name = "discuss.poll.answer";

    /** @type {number} */
    id;
    /** @type {string} */
    text;
    voting_partner_ids = Record.many("Persona");
}
DiscussPollAnswerModel.register();
