import { patch } from "@web/core/utils/patch";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
/**
 * @props partner
 */

patch(ActionpadWidget.prototype, {
    setup() {
        super.setup();
    },
    canOrder() {
        return !this.currentOrder.isRefund();
    },
    get swapButton() {
        return this.pos.config.module_pos_restaurant;
    },
    get currentOrder() {
        return this.pos.get_order();
    },
    get hasChangesToPrint() {
        const hasChange = this.pos.getOrderChanges();
        return hasChange.count;
    },
    get swapButtonClasses() {
        return {
            "highlight btn-primary justify-content-between": this.displayCategoryCount.length,
            "btn-light pe-none disabled justify-content-center": !this.displayCategoryCount.length,
            altlight: !this.hasChangesToPrint && this.currentOrder?.hasSkippedChanges(),
        };
    },
    submitOrder() {
        this.pos.sendOrderInPreparationUpdateLastChange(this.currentOrder);
    },
    hasQuantity(order) {
        if (!order) {
            return false;
        } else {
            return order.lines.reduce((totalQty, line) => totalQty + line.get_quantity(), 0) > 0;
        }
    },
    get highlightPay() {
        return (
            this.currentOrder.isRefund ||
            (this.currentOrder?.lines?.length &&
                !this.hasChangesToPrint &&
                this.hasQuantity(this.currentOrder))
        );
    },
    get displayCategoryCount() {
        return this.pos.categoryCount.slice(0, 4);
    },
    get isCategoryCountOverflow() {
        if (this.pos.categoryCount.length > 4) {
            return true;
        }
        return false;
    },
});
