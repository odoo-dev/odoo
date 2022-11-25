/** @odoo-module **/

import { convertBrToLineBreak } from "../utils";

export class Composer {
    message;
    textInputContent = "";
    thread;

    constructor({ thread, message }) {
        if (Boolean(thread) === Boolean(message)) {
            throw new Error("Composer shall have a thread xor a message.");
        }
        if (thread) {
            this.thread = thread;
        } else if (message) {
            this.message = message;
            this.textInputContent = convertBrToLineBreak(message.body);
        }
    }
}
