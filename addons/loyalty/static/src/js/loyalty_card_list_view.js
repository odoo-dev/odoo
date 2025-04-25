import { registry } from "@web/core/registry";
import { listView } from "@web/views/list/list_view";

class LoyaltyCardListController extends listView.Controller {
    static supportedProgramTypes = ['coupons', 'gift_card', 'ewallet'];

    get staticControlPanelButtons() {
        return {
            ...super.staticControlPanelButtons,
            generate: {
                isAvailable: () => this.supportedProgramTypes.includes(this.props.context.program_type),
                template: "loyalty.LoyaltyCardListView.buttons.Generate",
            },
        };
    }
}

export const LoyaltyCardListView = {
    ...listView,
    Controller: LoyaltyCardListController,
};

registry.category("views").add("loyalty_card_list_view", LoyaltyCardListView);
