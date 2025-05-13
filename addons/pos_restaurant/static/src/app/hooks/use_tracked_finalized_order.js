import { useEffect, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export const useTrackedFinalizedOrder = (initialOrderUuid, isOrderLocked, currentScreen) => {
    const pos = usePos();
    const state = useState({ trackedOrderUuid: initialOrderUuid });

    const findOrderByUuid = (uuid) => pos.models["pos.order"].getBy("uuid", uuid);

    useEffect(
        () => {
            const trackedOrder = findOrderByUuid(state.trackedOrderUuid);
            if (!trackedOrder || !trackedOrder.finalized || !isOrderLocked()) {
                return;
            }

            if (trackedOrder.state === "cancel" && !trackedOrder.is_empty()) {
                duplicateOrder(trackedOrder);
            } else {
                pos.showScreen(pos.firstScreen);
                pos.notification.add(
                    trackedOrder.state === "cancel"
                        ? _t("Order has been Cancelled from another device.")
                        : _t("Order has been Paid from another device."),
                    { type: "warning" }
                );
            }
        },
        () => [state.trackedOrderUuid, findOrderByUuid(state.trackedOrderUuid)?.state]
    );

    async function duplicateOrder(originalOrder) {
        const currentOrder = pos.get_order();
        const isSameOrder = currentOrder.uuid === originalOrder.uuid;
        // Reuse the current order only if it’s not the same as the original
        // (i.e., if a new one was created after deletion)
        const clonedOrder = isSameOrder ? pos.createNewOrder() : currentOrder;

        clonedOrder.last_order_preparation_change = {
            ...originalOrder.last_order_preparation_change,
            lines: {},
        };

        if (originalOrder.partner_id) {
            clonedOrder.set_partner(originalOrder.partner_id);
        }

        const cloneLine = (line) => {
            const lineData = line.serialize();
            delete lineData.uuid;
            return pos.models["pos.order.line"].create(
                { ...lineData, order_id: clonedOrder.id },
                false,
                true
            );
        };

        for (const line of originalOrder.lines) {
            const newLine = cloneLine(line);
            const prepLineData =
                originalOrder.last_order_preparation_change?.lines?.[line.preparationKey];

            if (prepLineData && line.preparationKey) {
                clonedOrder.last_order_preparation_change.lines[newLine.preparationKey] = {
                    ...prepLineData,
                    uuid: newLine.uuid,
                };
            }
        }

        pos.setTable(originalOrder.table_id, clonedOrder.uuid);

        if (Object.keys(originalOrder.last_order_preparation_change.lines).length) {
            await pos.sendOrderInPreparationUpdateLastChange(clonedOrder);
        } else {
            await pos.syncAllOrders({ orders: [clonedOrder] });
        }

        pos.showScreen(
            currentScreen || pos.firstScreen,
            currentScreen === "PaymentScreen" ? { orderUuid: clonedOrder.uuid } : {}
        );

        state.trackedOrderUuid = clonedOrder.uuid;
    }
};
