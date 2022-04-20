/** @odoo-module **/

export class SchemaEntry {
    constructor(params) {
        this.schema = params.schema;
        this.field = params.field;
        this.fieldInfo = params.fieldInfo;
        this.value = params.value;
        this.readonly = params.readonly;

        this.setup();
    }

    setup() {}

    get isInvisible() {
        const { invisible } = this.fieldInfo.modifiers;
        return invisible ? invisible.contains(this.schema.evaluateContext()) : false;
    }
    get isReadonly() {
        const { readonly } = this.fieldInfo.modifiers;
        return (
            this.field.readonly ||
            this.readonly ||
            (readonly ? readonly.contains(this.schema.evaluateContext()) : false)
        );
    }
    get isRequired() {
        const { required } = this.fieldInfo.modifiers;
        return required ? required.contains(this.schema.evaluateContext()) : false;
    }

    get string() {
        return this.fieldInfo.string || this.field.string;
    }

    async load() {}

    computeProps() {
        return {
            ...this.fieldInfo.props,
            name: this.fieldInfo.name,
            type: this.fieldInfo.type,
            value: this.value,
            readonly: this.isReadonly,
            required: this.isRequired,
        };
    }
}
