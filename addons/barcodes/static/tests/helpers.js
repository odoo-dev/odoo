import { press } from "@odoo/hoot-dom";

export async function simulateBarCode(chars) {
    await press("");
    for (const char of chars) {
        await press(char, { shiftKey: /^[A-Z]$/.test(char) });
    }
}
