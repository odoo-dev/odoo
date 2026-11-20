import { SplitBillScreen } from "@point_of_sale/app/screens/split_bill_screen/split_bill_screen";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

patch(SplitBillScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.isTransferred = false;
    },

    _prepareSplitLineValues(line, split) {
        const values = super._prepareSplitLineValues(...arguments);
        if (!this.pos.config.module_pos_restaurant) {
            return values;
        }
        // Create the courses in the new order
        let newCourse;
        if (line.course_id) {
            const courseIndex = line.course_id.index;
            split.newCourses ??= new Map();
            newCourse = split.newCourses.get(courseIndex);
            if (!newCourse) {
                newCourse = this.pos.models["restaurant.order.course"].create({
                    order_id: split.newOrder,
                    index: courseIndex,
                    name: _t("Course ") + courseIndex,
                });
                split.newCourses.set(courseIndex, newCourse);
            }
        }
        return { ...values, course_id: newCourse?.id };
    },

    async _applySplitPricing(originalOrder, newOrder) {
        // A transferred part is merged in another order, which keeps its own pricing.
        return super._applySplitPricing(originalOrder, this.isTransferred ? false : newOrder);
    },

    async _beforeSplitOrderSync(split) {
        await super._beforeSplitOrderSync(...arguments);
        if (this.pos.config.module_pos_restaurant) {
            // Synced with the orders so the other devices get the guests left
            const { originalOrder } = split;
            originalOrder.setCustomerCount(originalOrder.getCustomerCount() - 1);
        }
    },

    async transferSplittedOrder(event) {
        // Prevents triggering the 'startTransferOrder' event listener
        event.stopPropagation();
        const selectedQty = this.getNumberOfProducts();
        if (selectedQty > 0 && selectedQty !== this.currentOrder.splittableQuantity) {
            this.isTransferred = true;
            await this.createSplittedOrder();
        }
        this.pos.startTransferOrder();
    },
});
