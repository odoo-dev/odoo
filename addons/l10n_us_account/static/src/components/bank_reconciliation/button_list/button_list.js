import { BankRecButtonList } from "@account_accountant/components/bank_reconciliation/button_list/button_list";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

patch(BankRecButtonList.prototype, {
    actionOpenFactoring() {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "l10n_mx.register.factoring",
            target: "current",
            views: [[false, "form"]],
            context: {
                default_statement_line_id: this.statementLineData.id,
            },
        });
    },

    get isFactoringButtonShown() {
        // this.props.availableSaleOrders.length;
        // check if it makes sense (in MX, etc)
        return true;
    },

    get buttons() {
        const buttonsToDisplay = super.buttons;
        if (this.isFactoringButtonShown) {
            buttonsToDisplay.l10n_mx_factoring = {
                label: _t("Factoring"),
                action: this.actionOpenFactoring.bind(this),
            };
        }
        return buttonsToDisplay;
    },

    getBankRecSelectCreateDialogOptions() {
        const options = super.getBankRecSelectCreateDialogOptions();
        options.onFactor = async (moveLines) => {
            console.log(`should factor amls ${moveLines}`);
            // probably open another dialog for it
        };
        return options;
    }
});
