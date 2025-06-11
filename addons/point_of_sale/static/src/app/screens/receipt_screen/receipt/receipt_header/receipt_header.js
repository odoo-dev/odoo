import { _t } from "@web/core/l10n/translation";
import { Component, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class ReceiptHeader extends Component {
    static template = "point_of_sale.ReceiptHeader";
    static props = {
        data: {
            type: Object,
            shape: {
                company: Object,
                header: { type: [String, { value: false }], optional: true },
                cashier: { type: String, optional: true },
                "*": true,
            },
        },
    };

    setup() {
        this.orm = useService("orm");
        onWillStart(async () => {
            const [company] = await this.orm.read(
                "res.company",
                [this.props.data.company.id],
                ["logo"]
            );
            this.companyLogo = company?.logo ? `data:image/png;base64,${company.logo}` : null;
        });
    }

    get vatText() {
        if (this.props.data.company.country_id?.vat_label) {
            return _t("%(vatLabel)s: %(vatId)s", {
                vatLabel: this.props.data.company.country_id.vat_label,
                vatId: this.props.data.company.vat,
            });
        }
        return _t("Tax ID: %(vatId)s", { vatId: this.props.data.company.vat });
    }
}
