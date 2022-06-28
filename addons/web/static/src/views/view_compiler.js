/** @odoo-module **/

import { Domain } from "@web/core/domain";
import {
    combineAttributes,
    createElement,
    createTextNode,
    getTag,
    toStringExpression,
} from "@web/core/utils/xml";

/**
 * @typedef Compiler
 * @property {string} tag
 * @property {string} [class]
 * @property {(el: Element, params: Record<string, any>) => Element} fn
 */

const { useComponent, xml } = owl;

const templateIds = Object.create(null);

const BUTTON_CLICK_PARAMS = [
    "name",
    "type",
    "args",
    "context",
    "close",
    "confirm",
    "special",
    "effect",
    "help",
    "modifiers",
    // WOWL SAD: is adding the support for debounce attribute here justified or should we
    // just override compileButton in kanban compiler to add the debounce?
    "debounce",
];
const BUTTON_STRING_PROPS = ["string", "size", "title", "icon"];

/**
 * @param {Element} parent
 * @param {Node | Node[] | void} node
 */
export function append(parent, node) {
    if (!node) {
        return parent;
    }
    if (Array.isArray(node)) {
        parent.append(...node.filter(Boolean));
    } else {
        parent.append(node);
    }
    return parent;
}

/**
 * @param {Element} el
 * @param {string} attr
 * @param {string} string
 */
function appendAttr(el, attr, string) {
    const attrKey = `t-att-${attr}`;
    const attrVal = el.getAttribute(attrKey);
    el.setAttribute(attrKey, appendToStringifiedObject(attrVal, string));
}

/**
 * @param {string} originalTattr
 * @param {string} string
 * @returns {string}
 */
function appendToStringifiedObject(originalTattr, string) {
    const re = /{(.*)}/;
    const oldString = re.exec(originalTattr);

    if (oldString) {
        string = `${oldString[1]},${string}`;
    }
    return `{${string}}`;
}

/**
 * @param {any} invisible
 * @param {Element} compiled
 * @param {Record<string, any>} params
 * @returns {Element}
 */
export function applyInvisible(invisible, compiled, params) {
    if (!invisible) {
        return compiled;
    }
    if (typeof invisible === "boolean" && !params.enableInvisible) {
        return;
    }
    if (!params.enableInvisible) {
        combineAttributes(
            compiled,
            "t-if",
            `!evalDomain(record,${JSON.stringify(invisible)})`,
            " and "
        );
    } else {
        let expr;
        if (Array.isArray(invisible)) {
            expr = `evalDomain(record,${JSON.stringify(invisible)})`;
        } else {
            expr = invisible;
        }
        appendAttr(compiled, "class", `o_invisible_modifier:${expr}`);
    }
    return compiled;
}

/**
 * @param {Element} target
 * @param  {...Element} sources
 * @returns {Element}
 */
export function assignOwlDirectives(target, ...sources) {
    for (const source of sources) {
        for (const { name, value } of source.attributes) {
            if (name.startsWith("t-attf-")) {
                const propName = name.slice(7);
                const tAttf = value
                    .split("}}")
                    .map((leftAndExpr) => {
                        const [left, expr] = leftAndExpr.split("{{");
                        const part = toStringExpression(left);
                        return expr ? part + `+${expr}+` : part;
                    })
                    .join("");
                target.setAttribute(propName, tAttf);
            } else if (name.startsWith("t-att-")) {
                const propName = name.slice(6);
                target.setAttribute(propName, value);
            } else if (name.startsWith("t-")) {
                target.setAttribute(name, value);
            }
        }
    }
    return target;
}

/**
 * @param {Element} el
 * @param {Element} compiled
 */
export function copyAttributes(el, compiled) {
    if (getTag(el, true) === "button") {
        return;
    }

    const isComponent = isComponentNode(compiled);
    const classes = el.className;
    if (classes) {
        if (isComponent) {
            const cls = compiled.className;
            compiled.setAttribute("class", cls ? `'${classes} ' + ${cls}` : `'${classes}'`);
        } else {
            compiled.classList.add(...classes.split(/\s+/).filter(Boolean));
        }
    }

    for (const attName of ["style", "placeholder"]) {
        let att = el.getAttribute(attName);
        if (att) {
            if (isComponent) {
                att = toStringExpression(att);
            }
            compiled.setAttribute(attName, att);
        }
    }
}

/**
 * Decodes a string within an attribute into an Object
 * @param  {string} str
 * @return {Object}
 */
export function decodeObjectForTemplate(str) {
    return JSON.parse(decodeURI(str));
}

/**
 * Encodes an object into a string usable inside a pre-compiled template
 * @param  {Object}
 * @return {string}
 */
export function encodeObjectForTemplate(obj) {
    return `"${encodeURI(JSON.stringify(obj))}"`;
}

/**
 * @param {Element} el
 * @param {string} modifierName
 * @returns {boolean | boolean[]}
 */
export function getModifier(el, modifierName) {
    // cf python side def transfer_node_to_modifiers
    // modifiers' string are evaluated to their boolean or array form
    const modifiers = JSON.parse(el.getAttribute("modifiers") || "{}");
    const mod = modifierName in modifiers ? modifiers[modifierName] : false;
    return Array.isArray(mod) ? mod : !!mod;
}

/**
 * @param {any} node
 * @returns {string}
 */
function getTitleTag(node) {
    return getTag(node)[0].toUpperCase() + getTag(node).slice(1);
}

/**
 * @param {any} invisibleModifer
 * @param {{ enableInvisible?: boolean }} params
 * @returns {boolean}
 */
export function isAlwaysInvisible(invisibleModifer, params) {
    return !params.enableInvisible && typeof invisibleModifer === "boolean" && invisibleModifer;
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isComment(node) {
    return node.nodeType === 8;
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isComponentNode(el) {
    return (
        getTag(el) === getTitleTag(el) ||
        (getTag(el, true) === "t" && "t-component" in el.attributes)
    );
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isRelevantTextNode(node) {
    return isTextNode(node) && !!node.nodeValue.trim();
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isTextNode(node) {
    return node.nodeType === 3;
}

/**
 * @param {string} title
 * @returns {Element}
 */
export function makeSeparator(title) {
    const separator = createElement("div");
    separator.className = "o_horizontal_separator";
    separator.textContent = title;
    return separator;
}

export class ViewCompiler {
    constructor() {
        /** @type {number} */
        this.id = 1;
        /** @type {Compiler[]} */
        this.compilers = [];
        this.setup();
    }

    setup() {}

    /**
     * @param {Element} xmlElement
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compile(xmlElement, params = {}) {
        const newRoot = createElement("t");
        const child = this.compileNode(xmlElement, params);
        return append(newRoot, child);
    }

    /**
     * @param {Node} node
     * @param {Record<string, any>} params
     * @returns {Element | Text | void}
     */
    compileNode(node, params = {}, evalInvisible = true) {
        if (isComment(node)) {
            return;
        }
        if (isRelevantTextNode(node)) {
            return createTextNode(node.nodeValue);
        } else if (isTextNode(node)) {
            return;
        }

        let invisible;
        if (evalInvisible) {
            invisible = getModifier(node, "invisible");
            if (isAlwaysInvisible(invisible, params)) {
                return;
            }
        }

        const registryCompiler = this.compilers.find(
            (cp) =>
                cp.tag === getTag(node, true) && (!cp.class || node.classList.contains(cp.class))
        );
        const titleTag = getTitleTag(node);
        const compiler =
            (registryCompiler && registryCompiler.fn) ||
            this[`compile${titleTag === "A" ? "Button" : titleTag}`] ||
            this.compileGenericNode;

        let compiledNode = compiler.call(this, node, params);

        if (compiledNode) {
            copyAttributes(node, compiledNode);
        }

        if (evalInvisible && compiledNode) {
            compiledNode = applyInvisible(invisible, compiledNode, params);
        }
        return compiledNode;
    }

    // ------------------------------------------------------------------------
    // Compilers
    // ------------------------------------------------------------------------

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileButton(el, params) {
        let tag = getTag(el, true);
        const type = el.getAttribute("type");
        if (tag === "a") {
            if (!type) {
                return this.compileGenericNode(el, params);
            } else if (type === "url") {
                tag = "button";
            }
        }
        const button = createElement("ViewButton", {
            tag: toStringExpression(tag),
            record: "record",
        });

        assignOwlDirectives(button, el);

        const clickParams = {};
        for (const { name, value } of el.attributes) {
            if (BUTTON_CLICK_PARAMS.includes(name)) {
                clickParams[name] = value;
            } else if (BUTTON_STRING_PROPS.includes(name)) {
                button.setAttribute(name, toStringExpression(value));
            }
        }

        button.setAttribute("clickParams", JSON.stringify(clickParams));
        button.setAttribute("className", toStringExpression(el.className));
        el.removeAttribute("class");
        button.removeAttribute("class");

        // Button's body
        const buttonContent = [];
        for (const child of el.childNodes) {
            const compiled = this.compileNode(child, params);
            if (compiled) {
                buttonContent.push(compiled);
            }
        }
        if (buttonContent.length) {
            const contentSlot = createElement("t");
            contentSlot.setAttribute("t-set-slot", "contents");
            append(button, contentSlot);
            for (const buttonChild of buttonContent) {
                append(contentSlot, buttonChild);
            }
        }
        return button;
    }

    /**
     * @param {Element} el
     * @returns {Element}
     */
    compileField(el) {
        const fieldName = el.getAttribute("name");
        const fieldId = el.getAttribute("field_id") || fieldName;

        const field = createElement("Field");
        field.setAttribute("id", `'${fieldId}'`);
        field.setAttribute("name", `'${fieldName}'`);
        field.setAttribute("record", "record");
        field.setAttribute("fieldInfo", `fieldNodes['${fieldId}']`);
        field.setAttribute("t-props", `fieldNodes['${fieldId}'].propsFromAttrs`);

        if (el.hasAttribute("widget")) {
            field.setAttribute("type", `'${el.getAttribute("widget")}'`);
        }

        return field;
    }

    /**
     * @param {Element} el
     * @param {Record<string, any>} params
     * @returns {Element}
     */
    compileGenericNode(el, params) {
        const compiled = createElement(el.nodeName);
        const metaAttrs = ["modifiers", "attrs", "invisible", "readonly"];
        for (const attr of el.attributes) {
            if (metaAttrs.includes(attr.name)) {
                continue;
            }
            compiled.setAttribute(attr.name, attr.value);
        }
        for (const child of el.childNodes) {
            append(compiled, this.compileNode(child, params));
        }
        if (el.hasAttribute("t-foreach") && !el.hasAttribute("t-key")) {
            compiled.setAttribute("t-key", `${el.getAttribute("t-as")}_index`);
            console.warn(`Missing attribute "t-key" in "t-foreach" statement.`);
        }
        return compiled;
    }

    /**
     * @param {Element} el
     * @returns {Element}
     */
    compileWidget(el) {
        const attrs = {};
        const props = { record: "record", readonly: "props.readonly" };
        for (const { name, value } of el.attributes) {
            switch (name) {
                case "class":
                case "name": {
                    props[name] = `'${value}'`;
                    break;
                }
                case "modifiers": {
                    attrs.modifiers = JSON.parse(value || "{}");
                    break;
                }
                default: {
                    attrs[name] = value;
                }
            }
        }
        props.node = encodeObjectForTemplate({ attrs });
        const widget = createElement("Widget", props);
        return assignOwlDirectives(widget, el);
    }
}

/**
 * @param {typeof ViewCompiler} ViewCompiler
 * @param {string} templateKey
 * @param {Element} xmlDoc
 * @param {Record<string, any>} [params]
 * @returns {string}
 */
export function useViewCompiler(ViewCompiler, templateKey, xmlDoc, params) {
    const component = useComponent();

    // Assigns special functions to the current component.
    Object.assign(component, {
        evalDomain(record, expr) {
            return new Domain(expr).contains(record.evalContext);
        },
    });

    // Creates a new compiled template if the given template key hasn't been
    // compiled already.
    if (templateKey === undefined) {
        throw new Error("templateKey can not be Undefined!");
    }
    if (!templateIds[templateKey]) {
        const compiledDoc = new ViewCompiler().compile(xmlDoc, params);
        templateIds[templateKey] = xml`${compiledDoc.outerHTML}`;
        // DEBUG -- start
        console.group(`Compiled template (${templateIds[templateKey]}):`);
        console.dirxml(compiledDoc);
        console.groupEnd();
        // DEBUG -- end
    }
    return templateIds[templateKey];
}
