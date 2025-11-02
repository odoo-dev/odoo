import { useState, useEffect } from "@odoo/owl";
import { localization } from "@web/core/l10n/localization";
const { DateTime } = luxon;

export function useCurrentDate() {
    const state = useState({ date: "" });
    const dateFormat = localization.dateFormat
        .replace(/MM/g, "LLLL") // Full month name
        .replace(/\/yy$/, "/yyyy") // Ensure 4-digit year
        .replace(/[^a-zA-Z]+/g, " "); // Clean separators

    function setDate() {
        const now = DateTime.now();
        state.date = now.toFormat(dateFormat);
    }

    useEffect(
        () => {
            setDate(); // Set once on mount
        },
        () => [] // Run only once
    );

    return state;
}
