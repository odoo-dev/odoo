/** @odoo-module alias=mail.utils.unpatchClassMethods **/

import classPatchMap from 'mail.utils._classPatchMap';
import patchClassMethods from 'mail.utils.patchClassMethods';

/**
 * Inspired by web.utils:unpatch utility function
 *
 * @param {Class} Class
 * @param {string} patchName
 */
export default function unpatchClassMethods(Class, patchName) {
    let metadata = classPatchMap.get(Class);
    if (!metadata) {
        return;
    }
    classPatchMap.delete(Class);

    // reset to original
    for (let k in metadata.origMethods) {
        Class[k] = metadata.origMethods[k];
    }

    // apply other patches
    for (let name of metadata.current) {
        if (name !== patchName) {
            patchClassMethods(Class, name, metadata.patches[name]);
        }
    }
}
