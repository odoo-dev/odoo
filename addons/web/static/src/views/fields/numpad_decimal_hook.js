import { useLayoutEffect, useRef } from "@web/owl2/utils";
import { localization } from "@web/core/l10n/localization";
import { isIOS } from "@web/core/browser/feature_detection";
import { resolveRefEl } from "@web/core/utils/ref_utils";


function onKeydown(ev) {
    const decimalPoint = localization.decimalPoint;
    if (
        !([".", ","].includes(ev.key) && ev.code === "NumpadDecimal") ||
        ev.key === decimalPoint ||
        ev.target.type === "number"
    ) {
        return;
    }
    ev.preventDefault();
    ev.target.setRangeText(decimalPoint, ev.target.selectionStart, ev.target.selectionEnd, "end");
}

function onFocus(ev) {
    ev.target.select();
}

/**
 * This hook replaces the decimal separator of the numpad decimal key
 * by the decimal separator from the user's language setting when user
 * edits an input. The input is found using a t-ref="numpadDecimal"
 * reference in the current component. It can be placed directly on an
 * input or an element containing multiple inputs that require the
 * behavior
 *
 * NOTE: Special consideration for the input type = "number". In this
 * case, whatever the user types, we let the browser's default behavior.
 *
 * NOTE: On IOS devices, the inputmode attribute prevents the user from
 * entering a negative number (the minus sign is not on the virtual keyboard),
 * so we need to remove it.
 */
export function useNumpadDecimal(ref) {
    // `ref` may be an Owl 3 signal ref (a callable) or a legacy ref object;
    // when omitted, fall back to the legacy `t-ref="numpadDecimal"` named ref.
    // All element reads go through `resolveRefEl` so both forms are supported.
    ref = ref || useRef("numpadDecimal");
    const isIOSDevice = isIOS();
    useLayoutEffect(() => {
        let inputs = [];
        const el = resolveRefEl(ref);
        if (el) {
            inputs = el.nodeName === "INPUT" ? [el] : el.querySelectorAll("input");
            inputs.forEach((input) => input.addEventListener("keydown", onKeydown));
            inputs.forEach((input) => input.addEventListener("focus", onFocus));
            if (isIOSDevice) {
                inputs.forEach((input) => input.removeAttribute("inputmode"));
            }
        }
        return () => {
            inputs.forEach((input) => input.removeEventListener("keydown", onKeydown));
            inputs.forEach((input) => input.removeEventListener("focus", onFocus));
        };
    });
}
