/** @odoo-module **/

import { _lt } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Component, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { browser } from '@web/core/browser/browser';

export class One2ManyHistoryList extends Component {
    setup() {
        this.orm = useService("orm");

        this.updateLatestHistoryDiffs(this.props);
        onWillUpdateProps(this.updateLatestHistoryDiffs.bind(this));
    }

    updateLatestHistoryDiffs(props) {
        this.historyDiffs = props.record.data["history_diff_ids"];
        this.latestHistoryDiffs = [...this.historyDiffs.records].reverse().slice(0, 8);
    }

    get avatarUrl() {
        return '/web/image?model=res.users&field=avatar_128&id=' + this.props.record.data.create_uid[0];
    }
    get userName() {
        return this.props.record.data.create_uid[1];
    }

    async restoreVersion(historyDiffId) {
        await this.orm.call(
            'field.html.history.diff',
            "action_restore_version",
            [historyDiffId],
            {}
        );
        browser.location.reload();
    }

    async getComparisonAtDiffId(historyDiffId) {
        const text = await this.orm.call(
            'field.html.history.diff',
            "get_comparison",
            [historyDiffId],
            {}
        );
        console.log("get_comparison", text);
        document.querySelector(".note-editable.odoo-editor-editable").innerHTML = text;
        return text;
    }
}

One2ManyHistoryList.template = "web_editor.One2ManyHistoryList";
One2ManyHistoryList.displayName = _lt("Recent History List");
One2ManyHistoryList.supportedTypes = ["one2many"];

export const one2ManyHistoryList = {
    component: One2ManyHistoryList,
    supportedTypes: ["one2many"],
    relatedFields: [
        { name: "id", type: "int" },
        { name: "diff_size", type: "int" },
        { name: "time_ago", type: "text" },
        { name: "create_date", type: "text" },
        { name: "create_uid", type: "int" },
    ],
};

registry.category("fields").add("recent_history_list", one2ManyHistoryList);
