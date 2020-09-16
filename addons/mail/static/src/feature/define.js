/** @odoo-module alias=mail.feature.define **/

import FeatureDefinition from 'mail.classes.FeatureDefinition';

/**
 * @param {Object} param0
 * @param {boolean} [param0.global=false]
 * @param {string} [param0.id]
 * @param {string} param0.name
 * @param {any[]} param0.resources list containing either
 *   - (global) id
 *   - ActionAddon
 *   - ActionOriginal
 *   - Feature
 *   - ModelAddon
 *   - ModelOriginal
 * @returns {mail.classes.FeatureDefinition}
 */
export default function define({
    global = false,
    id,
    name,
    resources,
}) {
    // TODO: check id and name not already used in global
    const featureDefinition = new FeatureDefinition({
        id,
        name,
        resources,
    });
    // TODO: if global set, add to global registry
    return featureDefinition;
}
