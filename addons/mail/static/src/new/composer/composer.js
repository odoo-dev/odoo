/** @odoo-module */

import { Component, onMounted, onWillUpdateProps, useEffect, useRef, useState } from "@odoo/owl";
import { useMessaging } from "../messaging_hook";
import { useEmojiPicker } from "./emoji_picker";

export class Composer extends Component {
    setup() {
        this.messaging = useMessaging();
        this.ref = useRef("textarea");
        this.state = useState({
            autofocus: 0,
            value: this.props.message ? this.convertBrToLineBreak(this.props.message.body) : "",
        });
        useEmojiPicker("emoji-picker", {
            onSelect: (str) => this.addEmoji(str),
            preventClickPropagation: true,
        });
        useEffect(
            (focus) => {
                if (focus && this.ref.el) {
                    this.ref.el.focus();
                }
            },
            () => [this.props.autofocus + this.state.autofocus, this.props.placeholder]
        );
        onWillUpdateProps((nextProps) => {
            if (nextProps.message !== this.props.message) {
                this.state.value = nextProps.message
                    ? this.convertBrToLineBreak(nextProps.message.body)
                    : "";
            }
        });
        useEffect(
            () => {
                this.ref.el.style.height = "1px";
                this.ref.el.style.height = this.ref.el.scrollHeight + "px";
            },
            () => [this.state.value, this.ref.el]
        );
        onMounted(() => this.ref.el.scrollTo({ top: 0, behavior: "instant" }));
    }

    convertBrToLineBreak(str) {
        return new DOMParser().parseFromString(
            str.replaceAll("<br>", "\n").replaceAll("</br>", "\n"),
            "text/html"
        ).body.textContent;
    }

    onKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault(); // to prevent useless return
            if (this.props.message) {
                this.editMessage();
            } else {
                this.sendMessage();
            }
        } else if (ev.key === "Escape") {
            this.props.onDiscardCallback();
        }
    }

    async sendMessage() {
        const el = this.ref.el;
        if (el.value.trim()) {
            await this.messaging.postMessage(
                this.props.threadId,
                el.value,
                this.props.type === "note"
            );
            if (this.props.onPostCallback) {
                this.props.onPostCallback();
            }
        }
        this.state.value = "";
        el.focus();
    }

    async editMessage() {
        const el = this.ref.el;
        if (el.value.trim()) {
            await this.messaging.updateMessage(this.props.message.id, this.ref.el.value);
            if (this.props.onPostCallback) {
                this.props.onPostCallback();
            }
        }
        this.state.value = "";
        el.focus();
    }

    addEmoji(str) {
        this.state.value += str;
        this.state.autofocus++;
    }
}

Object.assign(Composer, {
    defaultProps: { type: "message", mode: "normal", onDiscardCallback: () => {} }, // mode = compact, normal, extended
    props: [
        "threadId?",
        "message?",
        "autofocus?",
        "onDiscardCallback?",
        "onPostCallback?",
        "mode?",
        "placeholder?",
        "type?",
    ],
    template: "mail.composer",
});
