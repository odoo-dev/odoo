import { useBarcodeReader } from "@point_of_sale/app/hooks/barcode_reader_hook";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

export function useOrderBarcode() {
    const pos = usePos();

    const _getOrderByBarcode = async (code) => {
        const id = parseInt(code.code.replace("ORD-", ""));
        let order = pos.models["pos.order"].getBy("id", id);
        if (!order) {
            order = await pos.data.searchRead("pos.order", [["id", "=", id]]);
            order = order.length > 0 && order[0];
        }
        return order;
    };

    const _barcodeOrderAction = async (code) => {
        const order = await _getOrderByBarcode(code);
        if (order) {
            pos.navigate("PaymentScreen", { orderUuid: order.uuid });
            return;
        }
    };

    useBarcodeReader({
        order: _barcodeOrderAction,
    });
}
