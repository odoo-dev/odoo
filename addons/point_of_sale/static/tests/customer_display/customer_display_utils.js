import { run } from "@point_of_sale/../tests/generic_helpers/utils";
import { range } from "@web/core/utils/numbers";

export function postMessage(message, description = "") {
    return run(() => {
        window.customerDisplayChannel.postMessage(
            typeof message === "string" ? JSON.parse(message) : message
        );
    }, `send message to customer display: ${description},  with value: ${message}`);
}

export function amountIs(method, amount) {
    return {
        content: `Check that the ${method} amount is ${amount}`,
        trigger: `div.row:has(div:contains('${method}')):has(div:contains('${amount}'))`,
    };
}

export function addProduct(product, description = "") {
    return {
        trigger: "div:contains('Welcome.')",
        run: async () => {
            window.customerDisplayChannel = new BroadcastChannel("UPDATE_CUSTOMER_DISPLAY");
            postMessage(product, description).run();
        },
    };
}

export const ADD_PRODUCT =
    '{"lines":[{"full_product_name":"Letter Tray","price_subtotal_incl":"$ 2,972.75","qty":"1.00","product_uom_name":"Units","unit_price":"$ 2,972.75","customer_note":"","note":"[]","combo_parent_id":"","lot_names":[],"price_without_discount":"$ 2,972.75","isSelected":false}],"finalized":false,"extra_data": {"prices": {"total_amount": "2,972.75"}},"payments":[],"change":0,"onlinePaymentData":{}}';

export const ADD_PRODUCT_SELECTED =
    '{"lines":[{"full_product_name":"Letter Tray","price_subtotal_incl":"$ 2,972.75","qty":"1.00","product_uom_name":"Units","unit_price":"$ 2,972.75","customer_note":"","note":"[]","combo_parent_id":"","lot_names":[],"price_without_discount":"$ 2,972.75","isSelected":true}],"finalized":false,"extra_data": {"prices": {"total_amount": "2,972.75"}},"payments":[],"change":0,"onlinePaymentData":{}}';

export const ADD_MULTI_PRODUCTS = (() => {
    const count = 20;
    const lines = range(1, count + 1).map((i) => {
        const price = (Math.random() * 100 + 1).toFixed(2);
        return {
            full_product_name: `Product ${i}`,
            price: `$${price}`,
            qty: "1.00",
            unit: "Units",
            unit_price: `$${price}`,
            customer_note: "",
            note: "[]",
            combo_parent_id: "",
            lot_names: [],
            price_without_discount: `$${price}`,
            isSelected: i === count,
        };
    });
    const amount = lines
        .reduce((sum, line) => sum + parseFloat(line.price.replace("$", "")), 0)
        .toFixed(2);
    return JSON.stringify({
        lines,
        order: { finalized: false },
        amount,
        payments: [],
        change: 0,
        onlinePaymentData: {},
    });
})();

export const PAY_WITH_CASH =
    '{"lines":[{"full_product_name":"Letter Tray","price_subtotal_incl":"$ 2,972.75","qty":"1.00","product_uom_name":"Units","unit_price":"$ 2,972.75","customer_note":"","note":"[]","combo_parent_id":"","lot_names":[],"price_without_discount":"$ 2,972.75","isSelected":true}], "order": {"finalized":false},"amount":"2,972.75","payments":[{"payment_method_data":{"name": "Cash"},"amount":"2,972.75"}],"change":0,"onlinePaymentData":{}}';

export const ORDER_IS_FINALIZED =
    '{"lines":[{"full_product_name":"Letter Tray","price_subtotal_incl":"$ 2,972.75","qty":"1.00","product_uom_name":"Units","unit_price":"$ 2,972.75","customer_note":"","note":"[]","combo_parent_id":"","lot_names":[],"price_without_discount":"$ 2,972.75","isSelected":false}], "order": {"finalized":true},"amount":"2,972.75","payments":[{"payment_method_data":{"name": "Cash"},"amount":"2,972.75"}],"change":0,"onlinePaymentData":{}}';

export const NEW_ORDER =
    '{"lines":[], "order": {"finalized":false}, "extra_data": {"prices": {"total_amount": "0.00"}},"payments":[],"change":0,"onlinePaymentData":{}}';

export const QR_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";

export const PAY_WITH_CARD = {
    lines: [
        {
            full_product_name: "Letter Tray",
            price: "$ 2,972.75",
            qty: "1.00",
            unit: "Units",
            unit_price: "$ 2,972.75",
            oldunit_price: "",
            customer_note: "",
            note: "",
            combo_parent_id: "",
            lot_names: [],
            price_without_discount: "$ 2,972.75",
            isSelected: true,
        },
    ],
    order: { finalized: false },
    amount: "2,972.75",
    payments: [{ payment_method_data: { name: "Cash" }, amount: "2,972.75" }],
    change: 0,
    onlinePaymentData: {},
    qrPaymentData: null,
};

export const SEND_QR = {
    lines: [
        {
            full_product_name: "Letter Tray",
            price: "$ 2,972.75",
            qty: "1.00",
            unit: "Units",
            unit_price: "$ 2,972.75",
            oldunit_price: "",
            customer_note: "",
            note: "",
            combo_parent_id: "",
            lot_names: [],
            price_without_discount: "$ 2,972.75",
            isSelected: true,
        },
    ],
    order: { finalized: false },
    amount: "2,972.75",
    payments: [{ payment_method_data: { name: "CARD" }, amount: "2,972.75" }],
    change: 0,
    onlinePaymentData: {},
    qrPaymentData: {
        amount: "$ 2,972.75",
        qrCode: QR_URL,
    },
};

export const PAY_ONLINE = {
    lines: [
        {
            full_product_name: "Letter Tray",
            price: "$ 2,972.75",
            qty: "1.00",
            unit: "Units",
            unit_price: "$ 2,972.75",
            oldunit_price: "",
            customer_note: "",
            note: "",
            combo_parent_id: "",
            lot_names: [],
            price_without_discount: "$ 2,972.75",
            isSelected: true,
        },
    ],
    order: { finalized: false },
    amount: "2,972.75",
    payments: [{ payment_method_data: { name: "ONLINE" }, amount: "2,972.75" }],
    change: 0,
    onlinePaymentData: {
        formattedAmount: "$ 2,972.75",
        orderName: "/",
        qrCode: QR_URL,
    },
};

export const PAID = {
    lines: [
        {
            full_product_name: "Letter Tray",
            price: "$ 2,972.75",
            qty: "1.00",
            unit: "Units",
            unit_price: "$ 2,972.75",
            oldunit_price: "",
            customer_note: "",
            note: "",
            combo_parent_id: "",
            lot_names: [],
            price_without_discount: "$ 2,972.75",
            isSelected: true,
        },
    ],
    order: { finalized: false },
    amount: "2,972.75",
    payments: [{ payment_method_data: { name: "ONLINE" }, amount: "2,972.75" }],
    change: 0,
    onlinePaymentData: {},
};

export const SCREENSAVER = {
    displayScreenSaver: true,
};
