import { Component, useState } from "@odoo/owl";

/**
 * @typedef {Object} Props
 * @property {import("models").Poll} poll
 * @extends {Component<Props, Env>}
 */
export class Poll extends Component {
    static template = "mail.Poll";
    static props = {
        poll: Object,
    };
    static components = {};

    setup() {
        window.tsm = this;
        this.state = useState({ showResults: false, checkedByAnswerId: {} });
    }

    toggleShowResults() {
        this.state.checkedByAnswerId = {};
        this.state.showResults = !this.state.showResults;
    }

    canVote() {
        return !this.state.showResults;
    }
}
