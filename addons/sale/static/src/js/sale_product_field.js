/** @odoo-module **/

import { registry } from '@web/core/registry';
import { Many2OneField, many2OneField } from '@web/views/fields/many2one/many2one_field';
import { useService } from "@web/core/utils/hooks";

export class SaleOrderLineProductField extends Many2OneField {

    setup() {
        super.setup();
        const { update } = this;
        this.productConfiguratorService = useService('saleProductConfiguratorService');
        this.update = async (value) => {
            await update(value);
            let newValue = false;
            // NB: quick creation doesn't go through here, but through quickCreate
            // below
            if (value) {
                if (Array.isArray(value[0]) && this.props.record.data[this.props.name] != value[0]) {
                    // product (existing)
                    newValue = true;
                } else {
                    // new product (Create & edit)
                    // value[0] is a dict of creation values
                    newValue = true;
                }
            }
            if (newValue) {
                if (this.relation === 'product.template') {
                    this._onProductTemplateUpdate();
                } else {
                    this._onProductUpdate();
                }
            }
        };

        if (this.props.canQuickCreate) {
            // HACK to make quick creation also open
            //      configurators if needed
            this.quickCreate = async (name, params = {}) => {
                await this.props.record.update({ [this.props.name]: [false, name]});

                if (this.relation === 'product.template') {
                    this._onProductTemplateUpdate();
                } else {
                    this._onProductUpdate();
                }
            };
        }

        if(!this.props.record.data.id) { // new record -> trigger configuration if necessary
            if (this.props.record.data.product_template_id) {
                this._onProductTemplateUpdate();
            } else if (this.props.record.data.product_id) {
                this._onProductUpdate();
            }
        }
    }

    get isProductClickable() {
        // product form should be accessible if the widget field is readonly
        // or if the line cannot be edited (e.g. locked SO)
        return (
            this.props.record.isReadonly(this.props.name)
            || this.props.record.model.root.isReadonly
            && this.props.record.model.root.activeFields.order_line
            && this.props.record.model.root.isReadonly('order_line')
        )
    }
    get hasExternalButton() {
        // Keep external button, even if field is specified as 'no_open' so that the user is not
        // redirected to the product when clicking on the field content
        const res = super.hasExternalButton;
        return res || (!!this.props.record.data[this.props.name] && !this.state.isFloating);
    }
    get hasConfigurationButton() {
        return this.isConfigurableLine || this.isConfigurableTemplate;
    }
    get isConfigurableLine() { return false; }
    get isConfigurableTemplate() { return false; }

    get configurationButtonHelp() {
        return this.env._t("Edit Configuration");
    }

    get configurationButtonIcon() {
        return 'btn btn-secondary fa ' + this.configurationButtonFAIcon();
    }

    configurationButtonFAIcon() {
        return 'fa-pencil';
    }

    onClick(ev) {
        // Override to get internal link to products in SOL that cannot be edited
        if (this.props.readonly) {
            ev.stopPropagation();
            this.openAction();
        }
        else {
            super.onClick(ev);
        }
    }

    _onProductUpdate() {
        const configureProduct = this._configureProduct();
        if (configureProduct) {
            this.productConfiguratorService.configureProduct(configureProduct);
        }
    }

    _onBoothProductUpdate(){
        const configureBoothProduct = this._configureBoothProduct();
        if (configureBoothProduct) {
            this.productConfiguratorService.configureProduct(configureBoothProduct);
        }
    }

    _onProductTemplateUpdate() {
        const configureProductTemplate = this._configureProductTemplate();
        if (configureProductTemplate) {
            this.productConfiguratorService.configureProduct(configureProductTemplate);
        }
    }

    _configureProduct() { return false; } // event_booth_sale, event_sale, sale_renting
    _configureBoothProduct(){ return false; } //event_booth_sale
    _configureProductTemplate() { return false; }

    onEditConfiguration() {
        if (this.isConfigurableLine) {
            this._editLineConfiguration();
        } else {
            this._editProductConfiguration();
        }
    }
    _editLineConfiguration() { } // event_booth_sale, event_sale, sale_renting
    _editProductConfiguration() { } // sale_product_configurator, sale_product_matrix

}

SaleOrderLineProductField.template = "sale.SaleProductField";

export const saleOrderLineProductField = {
    ...many2OneField,
    component: SaleOrderLineProductField,
};

registry.category("fields").add("sol_product_many2one", saleOrderLineProductField);
