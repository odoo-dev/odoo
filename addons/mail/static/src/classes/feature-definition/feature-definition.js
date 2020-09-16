/** @odoo-module alias=mail.classes.FeatureDefinition **/

export default class FeatureDefinition {
    /**
     * @param {Object} param0
     * @param {string} [param0.id]
     * @param {string} param0.name
     * @param {any[]} param0.resources
     */
    constructor({
        id,
        name,
        resources,
    }) {
        /**
         * Id of this feature.
         */
        this.id = id; // auto-generate if not given
        /**
         * Name of this feature.
         */
        this.name = name;
        /**
         * resources related to this feature. Resources are models/actions
         * (+ addons) which, all together, are part of the feature. In
         * definition form, could be either definition classes or global ids.
         */
        this.resources = resources;
    }
}
