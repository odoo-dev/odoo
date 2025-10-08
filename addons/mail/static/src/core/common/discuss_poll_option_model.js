import { fields } from "@mail/model/misc";
import { Record } from "@mail/model/record";

export class DiscussPollOptionModel extends Record {
    static id = "id";
    static _name = "discuss.poll.option";

    /** @type {string} */
    choice;
    /** @type {number} */
    id;
    /** @type {number} */
    number_of_votes;
    poll_id = fields.One("discuss.poll");
    /** @type {boolean} */
    selected_by_self;
    /** @type {number} */
    vote_percentage;
}
DiscussPollOptionModel.register();
