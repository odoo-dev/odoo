// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

import { signal } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export const DEFAULT_WEBSITE_NAME = _t("My Website");
export const LOGO_TARGETS_NAME = ["header", "footer", "cookie"];
export const MAIN_LOGO_TARGET = "header";
export const BRANDING_SELECTORS = {
    logos: {
        header: ".navbar-brand.logo span img",
        footer: ".o_footer_logo img",
        cookie: "#website_cookies_bar img[alt='Website Logo']",
    },
    websiteName: "header .navbar-brand",
};
// ============================================================================
// GETTERS
// ============================================================================

/**
 * Retrieves the logo image elements based on the requested targets.
 *
 * @param {Document|HTMLElement} root
 * @param {Array<string>} targets Ex: ["header", "footer", "cookie"]
 * @returns {Array<HTMLImageElement>}
 */
export function getLogoElements(root, targets = LOGO_TARGETS_NAME) {
    const foundLogos = [];
    for (const target of targets) {
        const selector = BRANDING_SELECTORS.logos[target];
        if (!selector) {
            continue;
        }

        // Use querySelectorAll to find all matching elements (in case of duplicates)
        const imgElements = root.querySelectorAll(selector);
        foundLogos.push(...imgElements);
    }

    return foundLogos;
}

export function getInitialLogoState(root) {
    return Object.fromEntries(
        LOGO_TARGETS_NAME.map((target) => {
            const selector = BRANDING_SELECTORS.logos[target];
            const elements = selector ? root.querySelectorAll(selector) : [];
            const initialUrl = elements[0]?.src || null;

            return [
                target,
                {
                    hasChange: signal(false),
                    initialUrlValue: initialUrl,
                },
            ];
        })
    );
}

/**
 * Retrieves the brand elements from the DOM based on the configuration.
 *
 * @param {Document|HTMLElement} root
 * @returns {Array<HTMLElement>}
 */
export function getBrandElements(root) {
    const selector = BRANDING_SELECTORS.websiteName;
    if (!selector) {
        return [];
    }

    return Array.from(root.querySelectorAll(selector));
}

// ============================================================================
// SETTERS
// ============================================================================

/**
 * Updates the logos based on the requested targets.
 *
 * @param {Document|HTMLElement} document
 * @param {string} url
 * @param {Array<string>} targets Ex: ["header", "footer", "cookie"]
 */
export function applyLogo(document, url, targets = LOGO_TARGETS_NAME) {
    if (!url) {
        return;
    }
    const logoElements = getLogoElements(document, targets);
    logoElements.forEach((imgElement) => {
        imgElement.src = url;
    });
}

/**
 * Internal utility: Updates a list of attributes on an element
 * and returns the functions to rollback these changes.
 */
function updateAttributes(element, attributes, name, previousName) {
    const rollbacks = [];
    attributes.forEach((attr) => {
        const currentVal = element.getAttribute(attr);
        if (currentVal && currentVal.includes(previousName)) {
            const newVal = replaceLastOccurrence(currentVal, previousName, name);
            element.setAttribute(attr, newVal);

            rollbacks.push((root) => {
                const el = root.querySelector(`[${attr}="${newVal}"]`) || element;
                if (el) {
                    el.setAttribute(attr, currentVal);
                }
            });
        }
    });
    return rollbacks;
}

/**
 * Handles the case where the branding is image-based.
 */
function updateImageBrand(brandElement, name, previousName) {
    const rollbacks = [];
    const attrsToUpdate = ["alt", "title", "aria-label"];

    rollbacks.push(...updateAttributes(brandElement, attrsToUpdate, name, previousName));

    const children = brandElement.querySelectorAll("img, span");
    children.forEach((child) => {
        rollbacks.push(...updateAttributes(child, attrsToUpdate, name, previousName));
    });

    return rollbacks;
}

/**
 * Handles the text-based branding case, preserving any nested HTML structure.
 */
function updateTextBrand(brandElement, name, previousName) {
    const rollbacks = [];
    const textTarget = brandElement.querySelector("span") || brandElement;

    const targetsToReplace = [previousName, DEFAULT_WEBSITE_NAME];

    Array.from(textTarget.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const originalText = node.nodeValue;
            const targetFound = targetsToReplace.find((t) => originalText.includes(t));

            if (targetFound) {
                node.nodeValue = replaceLastOccurrence(originalText, targetFound, name);
                rollbacks.push(() => {
                    node.nodeValue = originalText;
                });
            }
        }
    });

    return rollbacks;
}

/**
 * Applies the new website name to all brand elements in the DOM.
 *
 * @param {HTMLElement|Document} rootElement The root element to search within.
 * @param {string} name The new website name.
 * @param {string} previousName The previous website name.
 * @returns {Array<Function>} Array of rollback functions for cleanForSave.
 */
export function applyWebsiteNameDOM(rootElement, name, previousName) {
    if (name === previousName) {
        return [];
    }

    const rollbacks = [];
    const brandElements = rootElement.querySelectorAll(BRANDING_SELECTORS.websiteName);

    brandElements.forEach((brandElement) => {
        if (brandElement.querySelector("img")) {
            rollbacks.push(...updateImageBrand(brandElement, name, previousName));
        } else {
            rollbacks.push(...updateTextBrand(brandElement, name, previousName));
        }
    });

    return rollbacks;
}

/**
 * Applies the new website name to the title service.
 *
 * @param {Object} titleService The Odoo title service.
 * @param {string} name The new website name.
 * @param {string} previousName The previous website name.
 * @returns {Array<Function>} Array of rollback functions.
 */
export function applyWebsiteNameTitleService(titleService, name, previousName) {
    if (name === previousName) {
        return [];
    }
    const parts = titleService.getParts() || {};
    const updatedParts = {};
    const originalPartsToRestore = {};

    for (const [key, value] of Object.entries(parts)) {
        if (typeof value === "string" && value.includes(previousName)) {
            updatedParts[key] = replaceLastOccurrence(value, previousName, name);
            originalPartsToRestore[key] = value;
        }
    }

    const rollbacks = [];
    if (Object.keys(updatedParts).length > 0) {
        titleService.setParts(updatedParts);
        rollbacks.push(() => {
            titleService.setParts(originalPartsToRestore);
        });
    }
    return rollbacks;
}

/**
 * Orchestrates the DOM and Title Service updates for the website name.
 *
 * @param {HTMLElement|Document} rootElement The root element to update.
 * @param {Object} titleService The Odoo title service.
 * @param {string} name The new website name.
 * @param {string} previousName The previous website name.
 * @returns {Array<Function>} Array of rollback functions to reverse DOM and Title Service changes.
 */
export function applyWebsiteName(rootElement, titleService, name, previousName) {
    const titleRollbacks = applyWebsiteNameTitleService(titleService, name, previousName);
    const domRollbacks = applyWebsiteNameDOM(rootElement, name, previousName);

    return [...titleRollbacks, ...domRollbacks];
}

/**
 * Updates the favicon in the top window document.
 *
 * @param {string|null} url The URL of the new favicon, or null to remove it.
 */
export function applyFavicon(url) {
    const topDoc = window.top.document;
    topDoc.head
        .querySelectorAll("link[rel*='icon']")
        .forEach((link) => (link.href = url || "data:,"));
}

// ============================================================================
// UTILS
// ============================================================================

/**
 * Replaces the last occurrence of a substring within a string.
 *
 * @param {string} str The original string.
 * @param {string} search The substring to search for.
 * @param {string} replacement The substring to replace it with.
 * @returns {string} The modified string.
 */
export function replaceLastOccurrence(str, search, replacement) {
    const index = str.lastIndexOf(search);
    if (index === -1) {
        return str;
    }
    return str.slice(0, index) + replacement + str.slice(index + search.length);
}

/**
 * Builds a media URL for a website asset (logo/favicon).
 *
 * @param {number} websiteId The ID of the website.
 * @param {string} field The field name (e.g., 'logo', 'favicon').
 * @param {boolean} hasMedia Whether the media exists.
 * @param {number} token The cache-busting token.
 * @returns {string|null} The formatted URL, or null if no media exists.
 */
export function buildMediaUrl(websiteId, field, hasMedia) {
    if (!hasMedia) {
        return null;
    }
    return `/web/image/website/${websiteId}/${field}`;
}
