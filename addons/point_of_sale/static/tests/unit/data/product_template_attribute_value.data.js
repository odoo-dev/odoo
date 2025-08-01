import { models } from "@web/../tests/web_test_helpers";

export class ProductTemplateAttributeValue extends models.ServerModel {
    _name = "product.template.attribute.value";

    _load_pos_data_fields() {
        return [
            "attribute_id",
            "attribute_line_id",
            "product_attribute_value_id",
            "price_extra",
            "name",
            "is_custom",
            "html_color",
            "image",
            "exclude_for",
        ];
    }

    _records = [
        {
            id: 1,
            name: "White",
            product_attribute_value_id: 1,
            attribute_line_id: 1,
            attribute_id: 1,
            price_extra: 0,
            is_custom: false,
            html_color: "",
            image: "",
            exclude_for: [],
        },
        {
            id: 2,
            display_name: "Black",
            product_attribute_value_id: 2,
            attribute_line_id: 1,
            attribute_id: 1,
            price_extra: 0,
            is_custom: false,
            html_color: "",
            image: "",
            exclude_for: [],
        },
        {
            id: 3,
            display_name: "Blue",
            product_attribute_value_id: 3,
            attribute_line_id: 1,
            attribute_id: 1,
            price_extra: 0,
            is_custom: false,
            html_color: "",
            image: "",
            exclude_for: [],
        },
        {
            id: 4,
            display_name: "male",
            product_attribute_value_id: 4,
            attribute_line_id: 2,
            attribute_id: 2,
            price_extra: 0,
            is_custom: false,
            html_color: "",
            image: "",
            exclude_for: [],
        },
        {
            id: 5,
            display_name: "female",
            product_attribute_value_id: 5,
            attribute_line_id: 2,
            attribute_id: 2,
            price_extra: 0,
            is_custom: false,
            html_color: "",
            image: "",
            exclude_for: [],
        },
    ];
}
