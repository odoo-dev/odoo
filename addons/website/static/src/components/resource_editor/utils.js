import { _t } from "@web/core/l10n/translation";

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
 * @param {string} arch
 * @returns {Document|null} null if the arch is not well-formed
 */
function parseArch(arch) {
    const doc = new window.DOMParser().parseFromString(arch, "text/xml");
    if (doc.getElementsByTagName("parsererror").length) {
        return null;
    }
    return doc;
}

/**
 * @param {Element} root the root element of an inherited view's arch
 * @returns {Element[]} its operations (its "xpath" elements and the elements
 *  located by tag name and attributes)
 */
function getOperationsFromRoot(root) {
    return root.tagName === "data" ? [...root.children] : [root];
}

/**
 * @param {string} arch the arch of an inherited view
 * @returns {Element[]|null} its operations, or null if the arch is not
 *  well-formed
 */
export function getViewOperations(arch) {
    const doc = parseArch(arch);
    return doc && getOperationsFromRoot(doc.documentElement);
}

/**
 * @param {Element} operation
 * @returns {{attribute: string, add: string}|null} the modified attribute
 *  and the value added to it if the operation only adds a value to a single
 *  attribute (e.g. a CSS class)
 */
export function getAttributeAddition(operation) {
    if (operation.getAttribute("position") !== "attributes" || operation.children.length !== 1) {
        return null;
    }
    const attributeEl = operation.children[0];
    if (
        attributeEl.tagName !== "attribute" ||
        !attributeEl.getAttribute("name") ||
        !attributeEl.getAttribute("add") ||
        attributeEl.getAttribute("remove") ||
        attributeEl.textContent
    ) {
        return null;
    }
    return {
        attribute: attributeEl.getAttribute("name"),
        add: attributeEl.getAttribute("add"),
    };
}

/**
 * Detects "micro views": inherited views whose only content is a single
 * position="attributes" xpath with a single <attribute add="..."/> (e.g.
 * adding a CSS class on the target element). Their effect is simple enough
 * to be summarized on the view they target.
 *
 * @param {string} arch
 * @returns {{xpath: Element, attribute: string, add: string}|null} `xpath`
 *  is the "xpath" element itself, `attribute` the name of the modified
 *  attribute and `add` the value added to it
 */
export function getMicroViewInfo(arch) {
    const doc = new window.DOMParser().parseFromString(arch, "text/xml");
    const root = doc.documentElement;
    if (!root || root.children.length !== 1) {
        return null;
    }
    const xpath = root.children[0];
    if (xpath.tagName !== "xpath" || !xpath.getAttribute("expr")) {
        return null;
    }
    const addition = getAttributeAddition(xpath);
    return addition && { xpath, ...addition };
}

/**
 * @param {Element} operation
 * @returns {string} a short description of the effect of the operation
 */
export function describeOperation(operation) {
    const position = operation.getAttribute("position") || "inside";
    switch (position) {
        case "attributes": {
            const addition = getAttributeAddition(operation);
            if (addition) {
                return _t('Adds "%(value)s" to %(attribute)s', {
                    value: addition.add,
                    attribute: addition.attribute,
                });
            }
            return _t("Changes attributes");
        }
        case "inside":
            return _t("Inserts inside");
        case "after":
            return _t("Inserts after");
        case "before":
            return _t("Inserts before");
        case "replace":
            return operation.childNodes.length ? _t("Replaces") : _t("Removes");
        default:
            return position;
    }
}

const HASCLASS_REGEX = /hasclass\(([^)]*)\)/g;
// Absolute paths and positions depend on the whole combined arch, which is
// not known here: such expressions cannot be located reliably.
const UNRELIABLE_EXPR_REGEX = /^\/(?!\/)|\[\s*\d+\s*\]|position\(\)|last\(\)/;

/**
 * Evaluates the expression of an "xpath" operation, with the `hasclass`
 * function which only exists server side (see `getXpath` in
 * template_inheritance.js).
 *
 * @param {Element} root
 * @param {string} expr
 * @returns {Node[]}
 */
function evaluateXpath(root, expr) {
    const xpath = expr.replaceAll(HASCLASS_REGEX, (_, classes) =>
        classes
            .split(",")
            .map((c) => `contains(concat(' ', @class, ' '), ' ${c.trim().slice(1, -1)} ')`)
            .join(" and ")
    );
    let result;
    try {
        result = root.ownerDocument.evaluate(
            xpath,
            root,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
        );
    } catch {
        return [];
    }
    return Array.from({ length: result.snapshotLength }, (_, i) => result.snapshotItem(i));
}

/**
 * Tells whether an element of an arch is part of the template: in an
 * inherited view's arch, the operations themselves (and the "attribute"
 * elements of position="attributes" ones) are instructions, only the
 * elements they insert are.
 *
 * @param {Element} element
 * @param {Element[]|null} operations the operations of the arch, or null if
 *  it is the arch of a root view
 */
function isTemplateElement(element, operations) {
    if (!operations) {
        return true;
    }
    const operation = operations.find((op) => op !== element && op.contains(element));
    if (!operation || (operation.getAttribute("position") || "inside") === "attributes") {
        return false;
    }
    // "xpath" elements inside an operation move existing elements.
    const xpath = element.closest("xpath");
    return !xpath || xpath === operation;
}

/**
 * Finds the target of an operation in an arch, as the first matching element
 * that is part of the template. The actual target is looked for in the arch
 * resulting from the whole inheritance, which is not computed here: this is
 * a best effort.
 *
 * @param {Element} root the root element of the arch
 * @param {Element[]|null} operations the operations of the arch, or null if
 *  it is the arch of a root view
 * @param {Element} operation
 * @returns {Element|null}
 */
export function findOperationTarget(root, operations, operation) {
    let candidates;
    if (operation.tagName === "xpath") {
        const expr = operation.getAttribute("expr");
        if (!expr || UNRELIABLE_EXPR_REGEX.test(expr)) {
            return null;
        }
        candidates = evaluateXpath(root, expr);
    } else {
        const attributes = [...operation.attributes].filter(({ name }) => name !== "position");
        candidates = [root, ...root.getElementsByTagName(operation.tagName)].filter(
            (el) =>
                el.tagName === operation.tagName &&
                attributes.every(({ name, value }) => el.getAttribute(name) === value)
        );
    }
    return (
        candidates.find(
            (node) => node.nodeType === Node.ELEMENT_NODE && isTemplateElement(node, operations)
        ) || null
    );
}

/**
 * A parsed arch, to look for operation targets in.
 *
 * @param {string} arch
 * @param {boolean} isInherited whether it is the arch of an inherited view
 * @returns {{root: Element, operations: Element[]|null}|null} null if the
 *  arch is not well-formed
 */
export function parseTargetArch(arch, isInherited) {
    const doc = parseArch(arch);
    if (!doc) {
        return null;
    }
    const root = doc.documentElement;
    return { root, operations: isInherited ? getOperationsFromRoot(root) : null };
}

// Matches opening tags (capturing their name), along with the markup that
// may look like one (comments, CDATA sections, processing instructions,
// doctypes and closing tags) so that it is skipped. Quoted attribute values
// may contain ">".
const MARKUP_REGEX =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<\/[^>]*>|<([^\s/>]+)(?:"[^"]*"|'[^']*'|[^"'>])*>/g;

/**
 * Finds the row where the opening tag of elements of an arch ends. Each
 * element is matched to its opening tag in the arch text through its
 * occurrence index among the elements sharing its tag name: in document
 * order, elements follow the order of their opening tags in the source.
 *
 * @param {string} arch
 * @param {Element} root the root element of the parsed arch
 * @param {(Element|null)[]} elements elements of the parsed arch
 * @returns {(number|null)[]} for each element, the 0-based row (null if the
 *  element is null or its opening tag is not found)
 */
function getElementRows(arch, root, elements) {
    const openingTags = [...arch.matchAll(MARKUP_REGEX)].filter((match) => match[1]);
    return elements.map((element) => {
        if (!element) {
            return null;
        }
        const sameTagElements = [...root.getElementsByTagName(element.tagName)];
        if (root.tagName === element.tagName) {
            sameTagElements.unshift(root);
        }
        const occurrenceIndex = sameTagElements.indexOf(element);
        const openingTag = openingTags.filter((match) => match[1] === element.tagName)[
            occurrenceIndex
        ];
        if (!openingTag) {
            return null;
        }
        const end = openingTag.index + openingTag[0].length;
        return arch.slice(0, end).split(/\r\n|\r|\n/).length - 1;
    });
}

/**
 * Locates the targets of operations in an arch, as the row where the opening
 * tag of each target ends (see `getElementRows`). The target is resolved with
 * `findOperationTarget`.
 *
 * @param {string} arch
 * @param {boolean} isInherited whether it is the arch of an inherited view
 * @param {Element[]} operations the operations to locate (from other views)
 * @returns {(number|null)[]|null} for each operation, the 0-based row of the
 *  end of its target's opening tag (null if it has no target), or null if
 *  the arch is not well-formed (e.g. while it is being typed)
 */
export function getOperationTargetRows(arch, isInherited, operations) {
    const parsed = parseTargetArch(arch, isInherited);
    if (!parsed) {
        return null;
    }
    const targets = operations.map((operation) =>
        findOperationTarget(parsed.root, parsed.operations, operation)
    );
    return getElementRows(arch, parsed.root, targets);
}

/**
 * @param {string} arch the arch of an inherited view
 * @returns {number[]|null} the 0-based row where the opening tag of each of
 *  its operations ends (see `getViewOperations`), or null if the arch is not
 *  well-formed
 */
export function getOperationRows(arch) {
    const doc = parseArch(arch);
    if (!doc) {
        return null;
    }
    const root = doc.documentElement;
    return getElementRows(arch, root, getOperationsFromRoot(root));
}
