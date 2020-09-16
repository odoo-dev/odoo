/** @odoo-module alias=mail.classes.ModelField **/

/**
 * Class whose instances represent field on a model.
 * These field definitions are generated from declared fields in static prop
 * `fields` on the model.
 */
class ModelField {
    /**
     * @param {web.env} env
     * @param {Model} model
     * @param {string} name
     * @param {Object} param3
     */
    constructor(env, model, name, {
        compute,
        default: def,
        inverseFieldName,
        isCausal = false,
        related,
        relModelName,
        relType,
        type,
    } = {}) {
        /**
         * If set, this field acts as a computed field, and this prop
         * contains the name of the instance method that computes the value
         * for this field. This compute method is called on creation of record
         * and whenever some of its dependencies change.
         * @see modelManager:observers
         * @see modelManager:observees
         */
        this.compute = compute;
        /**
         * Default value for this field. Used on creation of this field, to
         * set a value by default. Could also be a function with no params
         * which, on call, returns the default value for this field.
         */
        this.default = def;
        /**
         * The messaging env.
         */
        this.env = env;
        /**
         * Identification for this field definition. Useful for debug.
         */
        this.id = `ModelField__${model.name}__${name}`;
        /**
         * This prop only makes sense in a relational field. This contains
         * the name of the field name in the inverse relation. This may not
         * be defined in declared field definitions, but processed relational
         * field definitions always have inverses.
         */
        this.inverseFieldName = inverseFieldName;
        /**
         * This prop only makes sense in a relational field. If set, when this
         * relation is removed, the related record is automatically deleted.
         */
        this.isCausal = isCausal;
        /**
         * Name of the field in the definition of fields on model.
         */
        this.name = name;
        /**
         * If set, this field acts as a related field, and this prop contains
         * a string that references the related field. It should have the
         * following format: '<relationName>.<relatedFieldName>', where
         * <relationName> is a relational field name on this model or a parent
         * model (note: could itself be computed or related), and
         * <relatedFieldName> is the name of field on the records that are
         * related to current record from this relation. When there are more
         * than one record in the relation, it maps all related fields per
         * record in relation.
         *
         * FIXME: currently flatten map due to bug, improvement is planned
         * see Task-id 2261221
         */
        this.related = related;
        /**
         * This prop only makes sense in a relational field. Determine which
         * model name this relation refers to.
         */
        this.relModelName = relModelName;
        /**
         * This prop only makes sense in a relational field. Determine which
         * type of relation there is between current record and other records.
         * 4 types of relation are supported: 'one2one', 'one2many', 'many2one'
         * and 'many2many'.
         */
        this.relType = relType;
        /**
         * Type of this field. 2 types of fields are currently supported:
         *
         *   1. 'attribute': fields that store primitive values like integers,
         *                   booleans, strings, objects, array, etc.
         *
         *   2. 'relation': fields that relate to some other records.
         */
        this.type = type;

        if (!this.default && this.fieldType === 'relation') {
            // default value for relational fields is the empty command
            this.default = [];
        }
    }
}

export default ModelField;
