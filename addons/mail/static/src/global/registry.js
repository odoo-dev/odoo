/** @odoo-module alias=mail.global.registry **/

import utils from 'mail.core.utils';

let nextObserverId = 1;
const observers = new Map();
const registry = new Map();

//------------------------------------------------------------------------------
// Public
//------------------------------------------------------------------------------

/**
 * @param {string} filepath
 * @param {string} featureName
 * @param  {...Object} slices feature slices defined with 'Feature/defineSlice'
 */
export function addFeature(filepath, featureName, ...slices) {
    const feature = utils.do('Feature/defineFeature', featureName, ...slices);
    registry.set(feature.name, feature);
    for (const observer of observers.values()) {
        observer.onAddFeature(feature.name);
    }
}

/**
 * @param {Object} param0
 * @param {function} param0.onAddFeature featureName => <void> callback called
 *   when featureName` is added to registry.
 * @param {function} [param0.onRemoveFeature] featureName => <void> callback
 *   called when `featureName` is removed from registry.
 * @returns {integer} the id allocated to observer. Useful to cleanly unobserve.
 */
export function observe({
    onAddFeature,
    onRemoveFeature,
}) {
    const observerId = nextObserverId;
    observers.set(observerId, {
        onAddFeature,
        onRemoveFeature,
    });
    nextObserverId++;
    return observerId;
}

/**
 * @param {string} featureName
 */
export function removeFeature(featureName) {
    registry.delete(featureName);
    for (const observer of observers.values()) {
        observer.onRemoveFeature(featureName);
    }
}

/**
 * @param {integer} observerId
 */
export function unobserve(observerId) {
    observers.delete(observerId);
}

export default registry;
