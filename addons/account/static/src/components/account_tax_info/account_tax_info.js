import { onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { usePopover } from "@web/core/popover/popover_hook";
import { AccountTaxPopup } from "./account_tax_info_popup";
import { Many2ManyTaxTagsField } from "@account/components/many2x_tax_tags/many2x_tax_tags";

export class AccountTaxInfo extends Many2ManyTaxTagsField {
    static template = "account.AccountTaxInfo";
    static props = {
        ...Many2ManyTaxTagsField.props,
    };

    setup() {
        super.setup();
        this.accountTaxPopup = usePopover(AccountTaxPopup);
        this.orm = useService("orm");
        this.state = useState({
            allTaxes: [],
        });
        onWillStart(async () => {
            await this.fetchAllTaxes();
        });
    }

    async fetchAllTaxes() {
        if (this.props.record.evalContext.id) {
            const result = await this.orm.read(
                "account.move.line",
                [this.props.record.evalContext.id],
                ["tax_ids_json"]
            );
            if (result && result.length) {
                const taxInfo = result[0].tax_ids_json;
                if (taxInfo) {
                    const allTaxes = await this.processTaxData(taxInfo);
                    this.state.allTaxes = allTaxes;
                }
            }
        }
    }

    async processTaxData(taxInfo) {
        if (Object.values(taxInfo)[0].tax_tag_ids && !Object.values(taxInfo)[0].base_tag_ids) {
            const tagIds = [...new Set(Object.values(taxInfo).flatMap((tax) => tax.tax_tag_ids))];

            const taxTagDetails = await this.orm.read("account.account.tag", tagIds, ["name"]);
            const taxTagMap = Object.fromEntries(taxTagDetails.map((tag) => [tag.id, tag.name]));
            return Object.values(taxInfo).map((tax) => ({
                ...tax,
                tax_tag_names: tax.tax_tag_ids.map((tagId) => taxTagMap[tagId] || ""),
                base_tag_names: [],
            }));
        }
        const taxIds = Object.values(taxInfo).map((tax) => tax.tax_id);
        const taxTagIds = [
            ...new Set(
                Object.values(taxInfo).flatMap((tax) =>
                    tax.tax_tag_ids.map((tagId) => parseInt(tagId))
                )
            ),
        ];
        const baseTagIds = [
            ...new Set(
                Object.values(taxInfo).flatMap((tax) =>
                    tax.base_tag_ids.map((tagId) => parseInt(tagId))
                )
            ),
        ];
        const taxDetails = await this.orm.read("account.tax", taxIds, ["name"]);
        const taxTagDetails = await this.orm.read("account.account.tag", taxTagIds, ["name"]);
        const baseTagDetails = await this.orm.read("account.account.tag", baseTagIds, ["name"]);

        const taxMap = Object.fromEntries(taxDetails.map((t) => [t.id, t.name]));
        const taxTagMap = Object.fromEntries(taxTagDetails.map((tag) => [tag.id, tag.name]));
        const baseTagMap = Object.fromEntries(baseTagDetails.map((tag) => [tag.id, tag.name]));

        return Object.values(taxInfo).map((tax) => ({
            ...tax,
            name: taxMap[tax.tax_id] || "",
            tax_tag_names: tax.tax_tag_ids.map((tagId) => taxTagMap[tagId] || ""),
            base_tag_names: tax.base_tag_ids.map((tagId) => baseTagMap[tagId] || ""),
        }));
    }

    getAccountTaxProps() {
        return {
            id: this.props.record.evalContext.id,
            allTaxes: this.state.allTaxes,
        };
    }

    openTaxPopupComponent(ev) {
        const target = ev.currentTarget;
        this.accountTaxPopup.open(target, this.getAccountTaxProps());
    }
}

export const accountTaxInfo = {
    component: AccountTaxInfo,
};

registry.category("fields").add("tax_ids_info", accountTaxInfo);
