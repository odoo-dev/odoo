/** @odoo-module alias=mail.utils.patchClassMethods **/

import classPatchMap from 'mail.utils._classPatchMap';

/**
 * Inspired by web.utils:patch utility function
 *
 * @param {Class} Class
 * @param {string} patchName
 * @param {Object} patch
 * @returns {function} unpatch function
 */
export default function patchClassMethods(Class, patchName, patch) {
    let metadata = classPatchMap.get(Class);
    if (!metadata) {
        metadata = {
            origMethods: {},
            patches: {},
            current: []
        };
        classPatchMap.set(Class, metadata);
    }
    if (metadata.patches[patchName]) {
        throw new Error(`Patch [${patchName}] already exists`);
    }
    metadata.patches[patchName] = patch;
    applyPatch(Class, patch);
    metadata.current.push(patchName);

    function applyPatch(Class, patch) {
        Object.keys(patch).forEach(function (methodName) {
            const method = patch[methodName];
            if (typeof method === "function") {
                const original = Class[methodName];
                if (!(methodName in metadata.origMethods)) {
                    metadata.origMethods[methodName] = original;
                }
                Class[methodName] = function (...args) {
                    const previousSuper = this._super;
                    this._super = original;
                    const res = method.call(this, ...args);
                    this._super = previousSuper;
                    return res;
                };
            }
        });
    }

    return () => unpatchClassMethods.bind(Class, patchName);
}
