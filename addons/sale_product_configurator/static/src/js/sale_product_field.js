/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { SaleOrderLineProductField } from '@sale/js/sale_product_field';
import { ProductConfiguratorModal } from "@sale_product_configurator/js/product_configurator_modal";
import {
    selectOrCreateProduct,
    getSelectedVariantValues,
    getNoVariantAttributeValues,
} from "sale.VariantMixin";


patch(SaleOrderLineProductField.prototype, 'sale_product_configurator', {

    // TODO
    // 1) optional products lines
    // 2) autofocus on first attribute in configurator
    //      unable to enter by hand custom values bc of it
    // 3) wizard opened when the variant is chosen in the 'Product Variant' field
    // 4) matrix

    setup() {
        this._super(...arguments);

        this.rpc = useService("rpc");
    },

    async _onProductTemplateUpdate() {
        this._super(...arguments);
        // FIXME VFE do not trigger anything if update comes from the product variant
        // field, as the 'new' value is only the related one.
        const result = await this.orm.call(
            'product.template',
            'get_single_product_variant',
            [this.props.record.data.product_template_id[0]],
        );
        if(result && result.product_id){
            if (this.props.record.data.product_id != result.product_id.id) {
                this.props.record.update({
                    'product_id': [result.product_id, 'whatever'],
                });
                if (result.has_optional_products) {
                    this._openProductConfigurator('options');
                } else {
                    this.productConfigured = true;
                }
            }
        } else {
            if (!result.add_mode || result.add_mode === 'configurator') {
                this._openProductConfigurator('add');
            } else {
                this._openGridConfigurator();
            }
        }
    },

    _editProductConfiguration() {
        this._super(...arguments);
        if (this.props.record.data.is_configurable_product) {
            this._openProductConfigurator('edit');
            // TODO matrix/grid
            // TODO add related field on product_add_mode ?
            // to use in matrix
        }
    },

    get isConfigurableTemplate() {
        return this._super(...arguments) || this.props.record.data.is_configurable_product;
    },

    async _openProductConfigurator(mode) {
        const saleOrderRecord = this.props.record.model.root;
        const pricelistId = saleOrderRecord.data.pricelist_id ? saleOrderRecord.data.pricelist_id[0] : false;
        const productTemplateId = this.props.record.data.product_template_id[0];
        const $modal = $(
            await this.rpc(
                "/sale_product_configurator/configure",
                {
                    'product_template_id': productTemplateId,
                    'quantity': this.props.record.data.product_uom_qty || 1,
                    'pricelist_id': pricelistId, // HOW to get this from SO ?
                    'product_template_attribute_value_ids': this.props.record.data.product_template_attribute_value_ids.records.map(
                        record => record.data.id
                    ),
                    'product_no_variant_attribute_value_ids': this.props.record.data.product_no_variant_attribute_value_ids.records.map(
                        record => record.data.id
                    ),
                    'context': this.props.record.context,
                },
            )
        );
        const productSelector = `input[type="hidden"][name="product_id"], input[type="radio"][name="product_id"]:checked`;
        // TODO VFE drop this selectOrCreate and make it so that
        // get_single_product_variant returns first variant as well.
        // and use specified product on edition mode.
        const productId = await selectOrCreateProduct.call(
            this,
            $modal,
            parseInt($modal.find(productSelector).first().val(), 10),
            productTemplateId,
            false
        );
        $modal.find(productSelector).val(productId);
        const variantValues = getSelectedVariantValues($modal);
        const noVariantAttributeValues = getNoVariantAttributeValues($modal);
        const customAttributeValues = this.props.record.data.product_custom_attribute_value_ids.records.map(
            record => {
                // NOTE: this dumb formatting is necessary to avoid
                // modifying the shared code between frontend & backend for now.
                return {
                    'custom_value': record.data.custom_value,
                    'custom_product_template_attribute_value_id': {
                        'res_id': record.data.custom_product_template_attribute_value_id[0],
                    },
                };
            }
        );
        this.rootProduct = {
            product_id: productId,
            product_template_id: parseInt(productTemplateId),
            quantity: parseFloat($modal.find('input[name="add_qty"]').val() || 1),
            variant_values: variantValues,
            product_custom_attribute_values: customAttributeValues,
            no_variant_attribute_values: noVariantAttributeValues,
        };
        const optionalProductsModal = new ProductConfiguratorModal(null, {
            rootProduct: this.rootProduct,
            pricelistId: pricelistId,
            okButtonText: this.env._t("Confirm"),
            cancelButtonText: this.env._t("Back"),
            title: this.env._t("Configure"),
            context: this.props.record.context,
            mode: mode,
        });
        optionalProductsModal.open();

        let confirmed = false;
        optionalProductsModal.on("confirm", null, async () => {
            confirmed = true;
            const [
                mainProduct,
                ...optionalProducts
            ] = await optionalProductsModal.getAndCreateSelectedProducts();
            // TODO optionalProducts
            // HACK: do not block line save bc the description was considered invalid
            //  when we clicked on another part of the dom than the 'confirm' button
            this.props.record._removeInvalidFields(['name']);
            this.productConfigured = true;
            this.props.record.update(
                this._convertConfiguratorDataToUpdateData(mainProduct)
            );
        });
        optionalProductsModal.on("closed", null, () => {
            if (confirmed) {
                return;
            }
            if (mode != 'edit') {
                this.props.record.update({
                    'product_template_id': false,
                    'product_id': false,
                    'product_uom_qty': 1.0,
                    // TODO reset custom/novariant values (and remove onchange logic)
                });
            }
        });
    },

    _convertConfiguratorDataToUpdateData(mainProduct) {
        let result = {
            // TODO find a way to get the real product name
            // bc 'whatever' is really displayed when showing the 'Product Variant' column
            'product_id': [mainProduct.product_id, 'whatever'],
            'product_uom_qty': mainProduct.quantity,
            // don't think the ptmpl_id update is useful, will be the same anyway
            //'product_template_id': [mainProduct.product_template_id, 'whatever'],
        };
        var customAttributeValues = mainProduct.product_custom_attribute_values;
        var customValuesCommands = [{ operation: "DELETE_ALL" }];
        if (customAttributeValues && customAttributeValues.length !== 0) {
            _.each(customAttributeValues, function (customValue) {
                // FIXME awa: This could be optimized by adding a "disableDefaultGet" to avoid
                // having multiple default_get calls that are useless since we already
                // have all the default values locally.
                // However, this would mean a lot of changes in basic_model.js to handle
                // those "default_" values and set them on the various fields (text,o2m,m2m,...).
                // -> This is not considered as worth it right now.
                customValuesCommands.push({
                    operation: "CREATE",
                    context: [
                        {
                            default_custom_product_template_attribute_value_id:
                                customValue.custom_product_template_attribute_value_id,
                            default_custom_value: customValue.custom_value,
                        },
                    ],
                });
            });
        }

        result["product_custom_attribute_value_ids"] = {
            operation: "MULTI",
            commands: customValuesCommands,
        };

        var noVariantAttributeValues = mainProduct.no_variant_attribute_values;
        var noVariantCommands = [{ operation: "DELETE_ALL" }];
        if (noVariantAttributeValues && noVariantAttributeValues.length !== 0) {
            var resIds = _.map(noVariantAttributeValues, function (noVariantValue) {
                return { id: parseInt(noVariantValue.value) };
            });

            noVariantCommands.push({
                operation: "ADD_M2M",
                ids: resIds,
            });
        }

        result["product_no_variant_attribute_value_ids"] = {
            operation: "MULTI",
            commands: noVariantCommands,
        };

        return result;
    }
});
