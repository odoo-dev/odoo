import { registry } from "@web/core/registry";
import { buildM2OFieldDescription, Many2OneField } from "@web/views/fields/many2one/many2one_field";
import { Many2XAutocomplete, useSelectCreate } from "@web/views/fields/relational_utils";
import { extractData, Many2One } from "@web/views/fields/many2one/many2one";

export function useSelectO2MCreate({
    resModel,
    activeActions,
    onSelected,
    onCreateEdit,
    onUnselect,
}) {
    // Use with caution! This will always send action as a link action
    activeActions.link = true;
    return useSelectCreate({ resModel, activeActions, onSelected, onCreateEdit, onUnselect });
}

class Many2XStockPackageAutocomplete extends Many2XAutocomplete {
    setup() {
        super.setup();
        const { activeActions, resModel, update, isToMany } = this.props;
        this.selectCreate = useSelectO2MCreate({
            resModel,
            activeActions,
            onSelected: (resId) => {
                const resIds = Array.isArray(resId) ? resId : [resId];
                const values = resIds.map((id) => ({ id }));
                return update(values);
            },
            onCreateEdit: ({ context }) => this.openMany2X({ context }),
            onUnselect: isToMany ? undefined : () => update(),
        });
    }
}

class StockPackageMany2OneReplacer extends Many2One {
    static components = {
        ...Many2One.components,
        Many2XAutocomplete: Many2XStockPackageAutocomplete,
    };
    updateMulti(value, options = {}) {
        this.props.record.update({ [this.props.name]: value }, options);
    }
    get many2XAutocompleteProps() {
        return {
            ...super.many2XAutocompleteProps,
            update: (records) => {
                for (const rec of records) {
                    const idNamePair = extractData(rec);
                    if (idNamePair) {
                        this.update(idNamePair);
                    }
                }
            },
        };
    }
}

export class Many2OneBankField extends Many2OneField {
    static components = {
        ...Many2OneField.components,
        Many2One: StockPackageMany2OneReplacer,
    };
}

registry.category("fields").add("multi_select_x2many", {
    ...buildM2OFieldDescription(Many2OneBankField),
});
