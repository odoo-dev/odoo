/**
 * Finding the element a lesson step points at, the way a learner would see
 * it: visible, and in the window on top when windows are stacked.
 */

/**
 * @param {HTMLElement} el
 * @param {{revealedOnHover?: boolean}} [options] accept elements that are laid
 *      out but only shown on hover, such as the link button of a many2one
 */
export function isVisible(el, { revealedOnHover = false } = {}) {
    if (!el.isConnected || !el.getClientRects().length) {
        return false;
    }
    const style = getComputedStyle(el);
    return (revealedOnHover || style.visibility !== "hidden") && style.display !== "none";
}

function matchesText(el, text) {
    return !text || el.textContent.trim().toLowerCase().includes(text.toLowerCase());
}

/** The window the learner can interact with: the last open dialog, or the page. */
export function getActiveLayer() {
    const dialogs = [...document.querySelectorAll(".o_dialog .modal")].filter(isVisible);
    return dialogs.at(-1) || document.body;
}

/**
 * @param {{trigger: string, text?: string, child?: string, revealedOnHover?: boolean}} selector
 *      `child`: the target is this element inside the one matched by
 *      `trigger` and `text` (e.g. the quantity cell of the row about labour)
 * @param {{anyLayer?: boolean}} [options] also look behind open windows
 * @returns {HTMLElement|null}
 */
export function findTarget({ trigger, text, child, revealedOnHover }, { anyLayer = false } = {}) {
    const layer = anyLayer ? document.body : getActiveLayer();
    const candidates = [...layer.querySelectorAll(trigger)];
    // dropdowns and autocompletes are rendered in the overlay container, outside dialogs
    if (layer !== document.body) {
        const popups = [...document.querySelectorAll(`.o-overlay-container ${trigger}`)];
        candidates.push(...popups.filter((el) => !el.closest(".o_dialog")));
    }
    for (const el of candidates) {
        if (!isVisible(el, { revealedOnHover }) || !matchesText(el, text)) {
            continue;
        }
        if (!child) {
            return el;
        }
        const inner = [...el.querySelectorAll(child)].find((innerEl) => isVisible(innerEl, { revealedOnHover }));
        if (inner) {
            return inner;
        }
    }
    return null;
}

/**
 * Waits for the target of a step to show up, e.g. a dropdown item once the
 * dropdown opened.
 *
 * @param {{trigger: string, text?: string}} selector
 * @returns {Promise<HTMLElement|null>}
 */
export async function waitForTarget(selector, timeout = 3000) {
    const start = Date.now();
    let target = findTarget(selector);
    while (!target && Date.now() - start < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        target = findTarget(selector);
    }
    return target;
}

/** Whether the whole element is inside the window. */
export function isInViewport(el) {
    const { top, left, bottom, right } = el.getBoundingClientRect();
    return top >= 0 && left >= 0 && bottom <= window.innerHeight && right <= window.innerWidth;
}
