import { useEffect } from "@odoo/owl";
import { memoize } from "@web/core/utils/functions";

/**
 * This is used on text inputs or textareas to automatically resize it based on its
 * content each time it is updated. It takes the reference of the element as
 * parameter and some options. Do note that it may introduce mild performance issues
 * since it will force a reflow of the layout each time the element is updated.
 * Do also note that it only works with textareas that are nested as only child
 * of some parent div (like in the text_field component).
 *
 * @param {Ref} ref
 */
export function useAutoresize(ref, options = {}) {
    let wasProgrammaticallyResized = false;
    let resize = null;
    useEffect(
        (el) => {
            if (el) {
                resize = (programmaticResize = false) => {
                    wasProgrammaticallyResized = programmaticResize;
                    if (options.ignoreIfEmpty && !el.value) {
                        return;
                    }
                    resizeQueue.set(el, options);
                    if (!resizeFlushScheduled) {
                        resizeFlushScheduled = true;
                        queueMicrotask(flushResizeQueue);
                    }
                };
                const onInput = () => resize(true);
                el.addEventListener("input", onInput);
                const resizeObserver = new ResizeObserver(() => {
                    // This ensures that the resize function is not called twice on input or page load
                    if (wasProgrammaticallyResized) {
                        wasProgrammaticallyResized = false;
                        return;
                    }
                    resize();
                });
                resizeObserver.observe(el);
                return () => {
                    el.removeEventListener("input", onInput);
                    resizeObserver.unobserve(el);
                    resizeObserver.disconnect();
                    resizeQueue.delete(el);
                    resize = null;
                };
            }
        },
        () => [ref.el]
    );
    useEffect(() => {
        if (resize) {
            resize(true);
        }
    });
}

const doesScrollWidthExcludePadding = memoize(() => {
    const input = document.createElement("input");
    input.style.cssText = `
        position: absolute;
        visibility: hidden;
        padding: 0;
        border: 0;
        width: auto;
    `;
    document.body.appendChild(input);
    const widthWithoutPadding = input.scrollWidth;
    input.style.padding = "10px";
    const widthWithPadding = input.scrollWidth;
    input.remove();
    return widthWithPadding === widthWithoutPadding;
});

const resizeQueue = new Map();
let resizeFlushScheduled = false;
// Batch pending resize operations to avoid repeated layout recalculations.
function flushResizeQueue() {
    resizeFlushScheduled = false;

    const elementsToResize = [...resizeQueue].filter(([el]) => el.isConnected);
    resizeQueue.clear();

    if (!elementsToResize.length) {
        return;
    }

    const inputElements = elementsToResize.filter(([el]) => el instanceof HTMLInputElement);
    const textareaElements = elementsToResize.filter(([el]) => !(el instanceof HTMLInputElement));

    // Set a common width before measuring the inputs.
    for (const [input] of inputElements) {
        input.style.width = "100%";
    }
    const availableWidths = inputElements.map(([input]) => input.clientWidth);

    // Use a small width to calculate the content size.
    for (const [input] of inputElements) {
        input.style.width = "10px";
    }
    const inputWidths = inputElements.map(([input], index) => {
        const style = window.getComputedStyle(input);

        if (input.value === "" && input.placeholder !== "") {
            return "auto";
        }

        let extraWidth = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
        if (doesScrollWidthExcludePadding()) {
            extraWidth +=
                parseFloat(style.paddingLeft) +
                parseFloat(style.paddingRight);
        }
        const contentWidth = input.scrollWidth + extraWidth + 1;
        return contentWidth > availableWidths[index]
            ? "100%"
            : `${contentWidth}px`;
    });

    for (let index = 0; index < inputElements.length; index++) {
        inputElements[index][0].style.width = inputWidths[index];
    }

    // Collect textarea dimensions before changing their styles.
    const textareaMeasurements = textareaElements.map(
        ([textarea, options = {}]) => {
            const style = window.getComputedStyle(textarea);
            let heightOffset = 0;
            if (style.boxSizing === "border-box") {
                heightOffset =
                    parseFloat(style.paddingTop) +
                    parseFloat(style.paddingBottom) +
                    parseFloat(style.borderTopWidth) +
                    parseFloat(style.borderBottomWidth);
            }
            return {
                textarea,
                options,
                previousStyle: {
                    borderTopWidth: style.borderTopWidth,
                    borderBottomWidth: style.borderBottomWidth,
                    padding: style.padding,
                },
                heightOffset,
            };
        }
    );

    // Reset dimensions before measuring the content height.
    for (const { textarea } of textareaMeasurements) {
        Object.assign(textarea.style, {
            height: "auto",
            borderTopWidth: 0,
            borderBottomWidth: 0,
            paddingTop: 0,
            paddingBottom: 0,
        });
    }
    const textareaHeights = textareaMeasurements.map(
        ({ textarea, options, heightOffset }) =>
            Math.max(
                options.minimumHeight || 0,
                textarea.scrollHeight + heightOffset
            )
    );
    for (let index = 0; index < textareaMeasurements.length; index++) {
        const { textarea, previousStyle } = textareaMeasurements[index];

        Object.assign(textarea.style, previousStyle, {
            height: `${textareaHeights[index]}px`,
        });
        if (textarea.parentElement) {
            textarea.parentElement.style.height = `${textareaHeights[index]}px`;
        }
    }
    for (const [element, options] of elementsToResize) {
        options.onResize?.(element, options);
    }
}

/**
 * @param {HTMLTextAreaElement} input
 * @param {{ minimumHeight?: number }} [options]
 */
export function resizeTextArea(textarea, options = {}) {
    const minimumHeight = options.minimumHeight || 0;
    let heightOffset = 0;
    const style = window.getComputedStyle(textarea);
    if (style.boxSizing === "border-box") {
        const paddingHeight = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        heightOffset = borderHeight + paddingHeight;
    }
    const previousStyle = {
        borderTopWidth: style.borderTopWidth,
        borderBottomWidth: style.borderBottomWidth,
        padding: style.padding,
    };
    Object.assign(textarea.style, {
        height: "auto",
        borderTopWidth: 0,
        borderBottomWidth: 0,
        paddingTop: 0,
        paddingBottom: 0,
    });
    const height = Math.max(minimumHeight, textarea.scrollHeight + heightOffset);
    Object.assign(textarea.style, previousStyle, { height: `${height}px` });
    textarea.parentElement.style.height = `${height}px`;
}
