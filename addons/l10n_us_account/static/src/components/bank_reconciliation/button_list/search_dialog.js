import {BankRecSelectCreateDialog} from "@account_accountant/components/bank_reconciliation/search_dialog/search_dialog";
import {patch} from "@web/core/utils/patch";

patch(BankRecSelectCreateDialog, {
    props: {
        ...BankRecSelectCreateDialog.props,
        onFactor: { type: Function, optional: true },
    },
});

patch(BankRecSelectCreateDialog.prototype, {
    factor(ids) {
        this.executeOnceAndClose(async () => {
            await this.props.onFactor(ids);
            await this.props.reloadLines();
        });
    }
});
