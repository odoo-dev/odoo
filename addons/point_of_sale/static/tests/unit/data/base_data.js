export const configData = {
    "pos.config": [
        {
            id: 1,
            name: "Hoot PoS",
        },
    ],
    "pos.session": [
        {
            id: 1,
            name: "Hoot Session",
            config_id: 1,
            state: "opened",
        },
    ],
    "res.country": [
        {
            id: 1,
            name: "Belgium",
            code: "BE",
            currency_id: 1,
        },
    ],
    "res.company": [
        {
            id: 1,
            name: "Hoot Company",
            currency_id: 1,
            country_id: 1,
            account_fiscal_country_id: 1,
        },
    ],
    "res.currency": [
        {
            id: 1,
            name: "Euro",
            symbol: "€",
            rounding: 0.01,
            position: "after",
        },
    ],
    "decimal.precision": [
        {
            id: 1,
            name: "Product Price",
            digits: 2,
        },
    ],
};

export const baseTax = {
    "account.tax": [
        {
            id: 1,
            name: "10% - Percentage",
            price_include: true,
            include_base_amount: true,
            is_base_affected: true,
            has_negative_factor: false,
            amount_type: "percent",
            amount: 10.0,
            formula_decoded_info: false,
        },
    ],
};

export const basicProductData = {
    ...this.baseTax,
    "account.tax": [
        {
            id: 1,
            name: "10% - Percentage",
            price_include: true,
            include_base_amount: true,
            is_base_affected: true,
            has_negative_factor: false,
            amount_type: "percent",
            amount: 10.0,
            formula_decoded_info: false,
        },
    ],
    "product.template": [
        {
            id: 1,
            name: "Test Product Template",
            type: "consu",
            list_price: 100.0,
            tax_ids: [1],
        },
    ],
    "product.product": [
        {
            id: 1,
            product_tmpl_id: 1,
            name: "Test Product Variant",
            lst_price: 100.0,
        },
    ],
};

export const basicProductWithAttribute = {
    ...this.baseTax,
    "product.attribute": [
        {
            id: 1,
            name: "Color",
            sequence: 1,
        },
    ],
    "product.attribute.value": [
        {
            id: 1,
            name: "White",
            attribute_id: 1,
        },
        {
            id: 2,
            name: "Black",
            attribute_id: 1,
        },
        {
            id: 3,
            name: "Blue",
            attribute_id: 1,
            default_extra_price: 5.0,
        },
    ],
    "product.template": [
        {
            id: 2,
            name: "Product template with attribute",
            type: "consu",
            list_price: 100.0,
            tax_ids: [1],
            attribute_line_ids: [
                {
                    attribute_id: 1,
                    value_ids: [1, 2, 3],
                },
            ],
        },
    ],
    "product.product": [
        {
            id: 2,
            product_tmpl_id: 2,
            name: "Product with attribute",
            lst_price: 100.0,
        },
    ],
};
