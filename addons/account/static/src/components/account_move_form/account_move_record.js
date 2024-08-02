import { Record } from "@web/model/relational_model/record";

import { AccountMoveLineIdsStaticList } from "@account/components/account_move_form/account_move_line_ids_static_list";

export class AccountMoveRecord extends Record {

    setup(config, data, options = {}) {
        super.setup(...arguments);
        const self = this;
        this.evalContextWithVirtualIds = new Proxy(this.evalContextWithVirtualIds, {
            get(target, prop, receiver) {
                const results = Reflect.get(...arguments);
                if(prop === "context"){
                    results.invoice_line_ids_mode = self.model.invoiceLineIdsMode;
                }
                return results;
            },
        })
    }

    _handlerStaticList(){
        return {
            get(target, prop, receiver) {
                return Reflect.get(...arguments);
            },
        }
    }

    /**
     * Override
     * Custom instance of 'StaticList' for 'line_ids'.
     */
    _createStaticListDatapoint(data, fieldName) {
        const isLineIds = fieldName === "line_ids";
        const staticListClass = this.model.constructor.StaticList;
        if(isLineIds){
            this.model.constructor.StaticList = AccountMoveLineIdsStaticList;
        }
        const results = super._createStaticListDatapoint(...arguments);
        this.model.constructor.StaticList = staticListClass;
        return results;
    }
}
