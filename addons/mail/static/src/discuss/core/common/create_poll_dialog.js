import { CreatePollOptionDialog } from "@mail/discuss/core/common/create_poll_option_dialog";

import { Component, useState } from "@odoo/owl";

import { Dialog } from "@web/core/dialog/dialog";
import { EmojiPicker } from "@web/core/emoji_picker/emoji_picker";
import { rpc } from "@web/core/network/rpc";
import { useAutofocus } from "@web/core/utils/hooks";

export class CreatePollDialog extends Component {
    static template = "mail.CreatePollDialog";
    static components = { Dialog, EmojiPicker, CreatePollOptionDialog };
    static props = ["close?", "thread?"];

    setup() {
        useAutofocus({ refName: "question" });
        this.state = useState({
            allowMultipleOptions: false,
            duration: "10",
            options: [{ choice: "" }, { choice: "" }],
            question: "",
            submitted: false,
        });
    }

    onClickAddOption() {
        this.state.options.push({ choice: "" });
    }

    onClickRemoveOption(index) {
        this.state.options.splice(index, 1);
    }

    onClickSubmit() {
        this.state.submitted = true;
        if (this.optionsMissing || this.questionMissing) {
            return;
        }
        rpc("/discuss/poll/create", {
            allow_multiple_options: this.state.allowMultipleOptions,
            options: this.state.options.map(({ choice }) => choice).filter(Boolean),
            channel_id: this.props.thread.id,
            poll_duration: this.state.duration,
            poll_question: this.state.question,
        });
        this.props.close();
    }

    get optionsMissing() {
        return (
            this.state.submitted &&
            this.state.options.filter(({ choice }) => Boolean(choice.trim())).length < 2
        );
    }

    get questionMissing() {
        return this.state.submitted && !this.state.question?.trim();
    }

    get canAddOption() {
        return this.state.options.every(({ choice }) => Boolean(choice));
    }
}
