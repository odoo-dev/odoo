import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";

class AccountJournalQuickCreateCard extends Component {
    static template = "account.AccountJournalQuickCreateCard";
    static props = ["image", "title", "text", "onClick"];
}

export class AccountJournalQuickCreate extends Component {
    static template = "account.AccountJournalQuickCreate";
    static props = [];
    static components = { AccountJournalQuickCreateCard };

    setup() {
        super.setup();
        this.orm = useService("orm");
        this.action = useService("action");
    }

    async openAccountWizard(type) {
        const add_bank_action = await this.orm.call(
            "res.company",
            `setting_init_${type}_account_action`,
            user.activeCompany.ids
        );
        this.action.doAction(add_bank_action);
        this.env.dialogData.close();
    }

    createJournal(type) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.journal",
            views: [[false, "form"]],
            target: "current",
            context: { default_type: type },
        });
    }
}

registry.category("actions").add("account_journal_quick_create", AccountJournalQuickCreate);
