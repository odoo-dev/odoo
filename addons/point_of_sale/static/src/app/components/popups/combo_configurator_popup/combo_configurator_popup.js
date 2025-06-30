import { Dialog } from "@web/core/dialog/dialog";
import { Component, useState, onMounted } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { ProductCard } from "@point_of_sale/app/components/product_card/product_card";
import { floatIsZero } from "@web/core/utils/numbers";

export class ComboConfiguratorPopup extends Component {
    static template = "point_of_sale.ComboConfiguratorPopup";
    static components = { ProductCard, Dialog };
    static props = {
        productTemplate: Object,
        getPayload: Function,
        close: Function,
        defaultComboLineIds: { type: Object, optional: true },
    };

    setup() {
        this.pos = usePos();
        const defaultAttributes = this.props.productTemplate.combo_ids.map((combo) => {
            const defaultCombo = this.props.defaultComboLineIds?.[combo.id];
            return [
                combo.id,
                {
                    combo_item_id: defaultCombo?.id || 0,
                    attribute_value_ids: defaultCombo?.orderline.attribute_value_ids || [],
                    custom_attribute_value_ids:
                        defaultCombo?.orderline.custom_attribute_value_ids || [],
                },
            ];
        });
        this.state = useState({
            combo: Object.fromEntries(
                this.props.productTemplate.combo_ids.map((combo) => [
                    combo.id,
                    this.props.defaultComboLineIds?.[combo.id]?.id || 0,
                ])
            ),
            // configuration: id of combo_item -> ProductConfiguratorPopup payload
            configuration: {},
            defaultAttributes: Object.fromEntries(defaultAttributes),
        });

        onMounted(() => {
            this.autoSelectSingleChoices();
            if (!this.hasMultipleChoices()) {
                this.confirm();
            }
        });
    }

    shouldShowCombo(combo) {
        return (
            combo.combo_item_ids.length > 0 &&
            (combo.combo_item_ids.length > 1 || combo.combo_item_ids[0].product_id.isConfigurable())
        );
    }

    autoSelectSingleChoices() {
        this.props.productTemplate.combo_ids.forEach((combo) => {
            if (
                combo.combo_item_ids.length === 1 &&
                !combo.combo_item_ids[0].product_id.isConfigurable()
            ) {
                this.state.combo[combo.id] = combo.combo_item_ids[0].id;
            }
        });
    }

    hasMultipleChoices() {
        return this.props.productTemplate.combo_ids.some((combo) => this.shouldShowCombo(combo));
    }

    areAllCombosSelected() {
        return Object.values(this.state.combo).every((x) => Boolean(x));
    }

    formattedComboPrice(comboItem) {
        const extra_price = comboItem.extra_price;
        if (floatIsZero(extra_price)) {
            return "";
        } else {
            const product = comboItem.product_id;
            const price = this.pos.getProductPrice(product, extra_price);
            return this.env.utils.formatCurrency(price);
        }
    }

    getSelectedComboItems() {
        return Object.values(this.state.combo)
            .filter((x) => x) // we only keep the non-zero values
            .map((x) => {
                const combo_item_id = this.pos.models["product.combo.item"].get(x);
                return {
                    combo_item_id: combo_item_id,
                    configuration: this.state.configuration[combo_item_id.id],
                };
            });
    }

    async onClickProduct({ product, combo_item }, ev) {
        const productTmpl = product.product_tmpl_id;
        if (productTmpl.needToConfigure()) {
            const defaultComboItemId = this.state.defaultAttributes[combo_item.combo_id.id];
            const comboAttributeIds = defaultComboItemId.attribute_value_ids;
            const comboCustomAttributeIds = defaultComboItemId.custom_attribute_value_ids;
            const payload = await this.pos.openConfigurator(product.product_tmpl_id, {
                hideAlwaysVariants: true,
                forceVariantValue: product.product_template_variant_value_ids,
                defaultAttributeIds:
                    comboAttributeIds.length > 0 &&
                    defaultComboItemId.combo_item_id === combo_item.id
                        ? comboAttributeIds
                        : undefined,
                defaultCustomAttributeIds:
                    comboCustomAttributeIds.length > 0 &&
                    defaultComboItemId.combo_item_id === combo_item.id
                        ? comboCustomAttributeIds
                        : undefined,
            });
            if (payload) {
                this.state.configuration[combo_item.id] = payload;

                defaultComboItemId.combo_item_id = combo_item.id;
                comboAttributeIds.length = 0;
                comboCustomAttributeIds.length = 0;
                for (const attrId of payload.attribute_value_ids) {
                    // Unkown
                    const attr = this.pos.models["product.template.attribute.value"].get(attrId);
                    if (!attr) {
                        continue;
                    }
                    comboAttributeIds.push(attr);

                    // Custom attribute
                    if (attr.is_custom) {
                        comboCustomAttributeIds.push({
                            custom_product_template_attribute_value_id: attr,
                            custom_value: payload.attribute_custom_values[attrId] || "",
                        });
                    }
                }
            } else {
                // Do not select the product if configuration popup is cancelled.
                this.state.combo[combo_item.combo_id.id] = 0;
            }
        }
    }

    confirm() {
        this.props.getPayload(this.getSelectedComboItems());
        this.props.close();
    }
}
