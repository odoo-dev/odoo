import { models } from "@web/../tests/web_test_helpers";

export class ProductTemplateAttributeLine extends models.ServerModel {
    _name = "product.template.attribute.line";
    _order = "id";

    _load_pos_data_fields() {
        return ["display_name", "attribute_id", "product_template_value_ids"];
    }

    _records = [
        {
            id: 1,
            display_name: "color",
            product_template_value_ids: [1, 2, 3],
            attribute_id: 1,
        },
        {
            id: 2,
            display_name: "gender",
            product_template_value_ids: [4, 5],
            attribute_id: 2,
        },
    ];
}
