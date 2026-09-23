import { _t } from "@web/core/l10n/translation";
import { escapeRegExp } from "@web/core/utils/strings";
import { getNode } from "@web/core/template_inheritance";

const MAPPING = {
    "{": "}",
    "}": "{",
    "(": ")",
    ")": "(",
    "[": "]",
    "]": "[",
};
const OPENINGS = ["{", "(", "["];
const CLOSINGS = ["}", ")", "]"];

/**
 * Checks the syntax validity of some SCSS.
 *
 * @param {string} scss
 * @returns {Object} object with keys "isValid" and "error" if not valid
 */
export function checkSCSS(scss) {
    const stack = [];
    let line = 1;
    for (let i = 0; i < scss.length; i++) {
        if (OPENINGS.includes(scss[i])) {
            stack.push(scss[i]);
        } else if (CLOSINGS.includes(scss[i])) {
            if (stack.pop() !== MAPPING[scss[i]]) {
                return {
                    isValid: false,
                    error: {
                        line,
                        message: _t("Unexpected %(char)s", { char: scss[i] }),
                    },
                };
            }
        } else if (scss[i] === "\n") {
            line++;
        }
    }
    if (stack.length > 0) {
        return {
            isValid: false,
            error: {
                line,
                message: _t("Expected %(char)s", { char: MAPPING[stack.pop()] }),
            },
        };
    }
    return { isValid: true };
}

/**
 * Checks the syntax validity of some XML.
 *
 * @param {string} xml
 * @returns {Object} object with keys "isValid" and "error" if not valid
 */
export function checkXML(xml) {
    const xmlDoc = new window.DOMParser().parseFromString(xml, "text/xml");
    const errorEls = xmlDoc.getElementsByTagName("parsererror");
    if (errorEls.length > 0) {
        const errorEl = errorEls[0];
        const sourceTextEls = errorEl.querySelectorAll("sourcetext");
        let codeEls = null;
        if (sourceTextEls.length) {
            codeEls = [...sourceTextEls].map((el) => {
                const codeEl = document.createElement("code");
                codeEl.textContent = el.textContent;
                const brEl = document.createElement("br");
                brEl.classList.add("o_we_source_text_origin");
                el.parentElement.insertBefore(brEl, el);
                return codeEl;
            });
            for (const el of sourceTextEls) {
                el.remove();
            }
        }
        for (const el of [...errorEl.querySelectorAll(":not(code):not(pre):not(br)")]) {
            const pEl = document.createElement("p");
            for (const cEl of [...el.childNodes]) {
                pEl.appendChild(cEl);
            }
            el.parentElement.insertBefore(pEl, el);
            el.remove();
        }
        errorEl.querySelectorAll(".o_we_source_text_origin").forEach((el, i) => {
            el.after(codeEls[i]);
        });
        return {
            isValid: false,
            error: {
                line: parseInt(errorEl.innerHTML.match(/[Ll]ine[^\d]+(\d+)/)[1], 10),
                message: errorEl.textContent,
            },
        };
    }
    return { isValid: true };
}

/**
 * Formats some XML so that it has proper indentation and structure.
 *
 * @param {string} xml
 * @returns {string} formatted xml
 */
export function formatXML(xml) {
    // do nothing if an inline script is present to avoid breaking it
    if (/<script(?: [^>]*)?>[^<][\s\S]*<\/script>/i.test(xml)) {
        return xml;
    }
    return window.vkbeautify.xml(xml, 4);
}

/**
 * Detects "micro views": inherited views whose only content is a single
 * position="attributes" xpath with a single <attribute add="..."/> (e.g.
 * adding a CSS class on the target element). Such views are simple enough
 * to also be represented inline on the view they target.
 *
 * @param {string} arch
 * @param {string} microViewKey the view key (e.g. `website.my_view`)
 * @returns {{xpath: Element, name: string, value: string, text: string}|null}
 *  `xpath` is the "xpath" element itself (usable as the `operation` argument
 *  of `getNode`), `text` its equivalent inline QWeb attribute, e.g.
 *  `t-attf-class="#{is_view_active(website.my_view) and 'added-class'}"`,
 *  made of `name` (`t-attf-class`) and `value` (the part between quotes)
 */
export function getMicroViewInfo(arch, microViewKey) {
    const doc = new window.DOMParser().parseFromString(arch, "text/xml");
    const root = doc.documentElement;
    if (!root || root.children.length !== 1) {
        return null;
    }
    const xpath = root.children[0];
    if (xpath.tagName !== "xpath" || xpath.getAttribute("position") !== "attributes") {
        return null;
    }
    if (!xpath.getAttribute("expr") || xpath.children.length !== 1) {
        return null;
    }
    const attributeEl = xpath.children[0];
    if (
        attributeEl.tagName !== "attribute" ||
        !attributeEl.getAttribute("add") ||
        attributeEl.getAttribute("remove") ||
        attributeEl.textContent
    ) {
        return null;
    }
    // Strip the initial t-att(f)- if present: the result is always shown as
    // a t-attf- attribute.
    const name = `t-attf-${attributeEl.getAttribute("name").replace(/^t-attf-|^t-att-/, "")}`;
    const add = attributeEl.getAttribute("add");
    const value = `#{is_view_active(${microViewKey}) and '${add}'}`;
    return { xpath, name, value, text: `${name}="${value}"` };
}

/**
 * @param {string} arch
 * @param {Element} xpath the "xpath" element of a micro view (see
 *  `getMicroViewInfo`), used as the `operation` argument of `getNode`
 * @returns {Element|null}
 */
export function getMicroViewTargetElement(arch, xpath) {
    const doc = new window.DOMParser().parseFromString(arch, "text/xml");
    return getNode(doc.documentElement, xpath);
}

/**
 * Locates a micro view's target inside a given arch: the target is
 * resolved with a real xpath evaluation (`getMicroViewTargetElement`), then
 * that element's occurrence index (in document order, among elements
 * sharing its tag name) is used to find the matching opening tag in the
 * raw arch text: XML nesting order matches the order opening tags appear
 * in the source, so the two orders line up.
 *
 * @param {string} arch
 * @param {Element} xpath the "xpath" element of a micro view
 * @returns {{start: number, end: number}|null} character range of the
 *  matched opening tag (end is exclusive, right after its ">"), or null
 */
export function getMicroViewTargetRange(arch, xpath) {
    const target = getMicroViewTargetElement(arch, xpath);
    if (!target) {
        return null;
    }
    const sameTagElements = [
        ...target.ownerDocument.documentElement.getElementsByTagName(target.tagName),
    ];
    const occurrenceIndex = sameTagElements.indexOf(target);
    if (occurrenceIndex === -1) {
        return null;
    }
    const tagRegex = new RegExp(`<${escapeRegExp(target.tagName)}\\b[^>]*>`, "g");
    let match;
    let count = 0;
    while ((match = tagRegex.exec(arch))) {
        if (count === occurrenceIndex) {
            return { start: match.index, end: match.index + match[0].length };
        }
        count++;
    }
    return null;
}

/**
 * Injects `t-attf-...="#{is_view_active(...) and '...'}"` attributes (see
 * `getMicroViewInfo`) to summarize the effect of the micro views acting on
 * the arch. This is purely cosmetic as they will be removed by
 * `stripMicroViewAttributes`.
 *
 * @param {string} arch
 * @param {{microViewInfo: {xpath: Element, name: string, value: string, text: string}}[]} microViews
 * @returns {string}
 */
export function injectMicroViewAttributes(arch, microViews) {
    const injections = [];
    for (const { microViewInfo } of microViews) {
        const range = getMicroViewTargetRange(arch, microViewInfo.xpath);
        if (range) {
            injections.push({ text: microViewInfo.text, end: range.end });
        }
    }
    // Insert backwards so earlier offsets stay valid.
    injections.sort((a, b) => b.end - a.end);

    let result = arch;
    for (const { text, end } of injections) {
        const isSelfClosing = result[end - 2] === "/";
        const insertAt = isSelfClosing ? end - 2 : end - 1;
        result = result.slice(0, insertAt) + ` ${text}` + result.slice(insertAt);
    }
    return result;
}

/**
 * Reverts `injectMicroViewAttributes`, so the arch sent back for saving
 * (or fed back into the injector on the next render) never carries the
 * display-only micro view attributes.
 *
 * @param {string} arch
 * @param {{microViewInfo: {xpath: Element, name: string, value: string, text: string}}[]} microViews the micro views given
 *  to `injectMicroViewAttributes`
 * @returns {string}
 */
export function stripMicroViewAttributes(arch, microViews) {
    // Also remove the space inserted before each injected string.
    return microViews.reduce(
        (result, { microViewInfo }) => result.replace(` ${microViewInfo.text}`, ""),
        arch
    );
}
