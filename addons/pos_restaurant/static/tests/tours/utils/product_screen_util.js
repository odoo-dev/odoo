import * as Order from "@point_of_sale/../tests/tours/utils/generic_components/order_widget_util";
import * as ProductScreen from "@point_of_sale/../tests/tours/utils/product_screen_util";

export function clickOrderButton() {
    return [
        {
            content: "click order button",
            trigger: ".actionpad .submit-order",
            run: "click",
        },
    ];
}
export function orderlinesHaveNoChange() {
    return Order.doesNotHaveLine({ withClass: ".has-change" });
}
export function orderlineIsToOrder(name) {
    return Order.hasLine({
        productName: name,
        withClass: ".has-change.border-start.border-primary.border-4",
    });
}
export function orderlineIsToSkip(name) {
    return Order.hasLine({
        withClass: ".skip-change.text-primary.border-start.border-primary.border-4",
        productName: name,
    });
}
export function guestNumberIs(num) {
    return [
        ...ProductScreen.clickControlButtonMore(),
        {
            content: `guest number is ${num}`,
            trigger: ProductScreen.controlButtonTrigger("Guests") + `:contains(${num})`,
        },
    ];
}
export function orderBtnIsPresent() {
    return [
        {
            content: "Order button is here",
            trigger: ".actionpad .button.submit-order",
        },
    ];
}
export function tableNameShown(table_name) {
    return [
        {
            content: "Table name is shown",
            trigger: `.table-name:contains(${table_name})`,
        },
    ];
}
