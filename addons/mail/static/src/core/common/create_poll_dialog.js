import { CreatePollDialogAnswer } from "@mail/discuss/core/public_web/create_poll_dialog_answer";
import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { EmojiPicker } from "@web/core/emoji_picker/emoji_picker";
import { rpc } from "@web/core/network/rpc";

export class CreatePollDialog extends Component {
    static template = "mail.CreatePollDialog";
    static components = { Dialog, EmojiPicker, CreatePollDialogAnswer };
    static props = ["thread?"];

    setup() {
        this.state = useState({
            answers: [{ text: "" }, { text: "" }],
            question: "",
            submitted: false,
        });
        this.focusNextAnswer = false;
    }

    onClickAddAnswer() {
        this.focusNextAnswer = true;
        this.state.answers.push({ text: "" });
    }

    onClickRemoveAnswer(index) {
        this.state.answers.splice(index, 1);
    }

    registerAnswerRef(ref) {
        if (this.focusNextAnswer) {
            ref.el.focus();
            this.focusNextAnswer = false;
        }
    }

    onClickSubmit() {
        this.state.submitted = true;
        if (this.answersMissing || this.questionMissing) {
            return;
        }
        rpc("/poll/create", {
            channel_id: this.props.thread?.id,
            question: this.state.question,
            answers: this.state.answers.map(({ text }) => text),
        });
        this.props.close();
    }

    get answersMissing() {
        return (
            this.state.submitted &&
            this.state.answers.filter(({ text }) => Boolean(text)).length < 2
        );
    }

    get questionMissing() {
        return this.state.submitted && !this.state.question;
    }
}
