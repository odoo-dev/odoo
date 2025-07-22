import { patch } from "@web/core/utils/patch";
import {
    modelsToLoad,
    posModels,
    PosOrderLine,
    PosSession,
    ProductTemplate,
    ResPartner,
} from "@point_of_sale/../tests/unit/data/generate_model_definitions";
import { defineModels, models } from "@web/../tests/web_test_helpers";

export class SaleOrder extends models.ServerModel {
    _name = "sale.order";

    _load_pos_data_fields() {
        return [
            "name",
            "state",
            "user_id",
            "order_line",
            "partner_id",
            "pricelist_id",
            "fiscal_position_id",
            "amount_total",
            "amount_untaxed",
            "amount_unpaid",
            "picking_ids",
            "partner_shipping_id",
            "partner_invoice_id",
            "date_order",
            "write_date",
        ];
    }

    async load_sale_order_from_pos(id, config_id) {
        const posData = PosSession.prototype.load_data.call();
        const order = posData["sale.order"].find((order) => order.id === id);
        const orderLines = posData["sale.order.line"].filter((line) =>
            order.order_line.includes(line.id)
        );
        const partner = posData["res.partner"].find((partner) => partner.id === order.partner_id);
        const productProducts = posData["product.product"].filter((product) =>
            orderLines.map((line) => line.product_id).includes(product.id)
        );
        const productTemplates = posData["product.template"].filter((template) =>
            productProducts.map((p) => p.product_tmpl_id).includes(template.id)
        );
        return {
            "sale.order": [order],
            "sale.order.line": orderLines,
            "res.partner": [partner],
            "product.product": productProducts,
            "product.template": productTemplates,
        };
    }
}

export class SaleOrderLine extends models.ServerModel {
    _name = "sale.order.line";

    _load_pos_data_fields() {
        return [
            "discount",
            "display_name",
            "price_total",
            "price_unit",
            "product_id",
            "product_uom_qty",
            "qty_delivered",
            "qty_invoiced",
            "qty_to_invoice",
            "display_type",
            "name",
            "tax_ids",
            "is_downpayment",
            "extra_tax_data",
            "write_date",
            "is_repair_line",
        ];
    }

    async read_converted() {
        return [
            {
                id: 5,
                lot_names: [],
            },
            {
                id: 6,
                lot_names: [],
            },
        ];
    }
}

patch(PosOrderLine.prototype, {
    _load_pos_data_fields() {
        return [
            ...super._load_pos_data_fields(),
            "sale_order_origin_id",
            "sale_order_line_id",
            "down_payment_details",
            "settled_order_id",
            "settled_invoice_id",
        ];
    },
});

patch(ProductTemplate.prototype, {
    _load_pos_data_fields() {
        return [...super._load_pos_data_fields(), "sale_line_warn_msg", "invoice_policy"];
    },
});

patch(ResPartner.prototype, {
    _load_pos_data_fields() {
        return [...super._load_pos_data_fields(), "sale_warn_msg"];
    },
});

patch(PosSession.prototype, {
    load_data() {
        const data = super.load_data();
        const productTemplateDownPayment = {
            id: 7,
            display_name: "Down Payment (POS)",
            standard_price: 0,
            categ_id: false,
            pos_categ_ids: [],
            taxes_id: [],
            barcode: false,
            name: "Down Payment (POS)",
            list_price: 0,
            is_favorite: false,
            default_code: false,
            to_weight: false,
            uom_id: 1,
            description_sale: false,
            description: false,
            tracking: "none",
            type: "service",
            service_tracking: "no",
            is_storable: false,
            write_date: "2025-07-03 17:04:14",
            color: 0,
            pos_sequence: 5,
            available_in_pos: true,
            attribute_line_ids: [],
            active: true,
            image_128: false,
            sequence: 1,
            combo_ids: [],
            product_variant_ids: [7],
            public_description: false,
            pos_optional_product_ids: [],
            product_tag_ids: [],
            _archived_combinations: [],
        };
        data["product.template"].push(productTemplateDownPayment);

        const productProductDownPayment = {
            id: 7,
            product_tmpl_id: 7,
            lst_price: 0,
            standard_price: 0,
            display_name: "Down Payment (POS)",
            product_tag_ids: [],
            barcode: false,
            default_code: false,
            product_template_attribute_value_ids: [],
            product_template_variant_value_ids: [],
        };
        data["product.product"].push(productProductDownPayment);

        data["pos.config"].find((config) => config.id === 1).down_payment_product_id = 7;

        const so = {
            id: 1,
            name: "S00001",
            state: "sale",
            user_id: 1,
            order_line: [1, 2],
            partner_id: 1,
            pricelist_id: 1,
            fiscal_position_id: 1,
            amount_total: 650,
            amount_untaxed: 500,
            amount_unpaid: 650,
            picking_ids: [],
            partner_shipping_id: 1,
            partner_invoice_id: 1,
            date_order: "2025-07-03 17:04:14",
            write_date: "2025-07-03 17:04:14",
        };
        data["sale.order"] = [so];

        const sol1 = {
            id: 1,
            display_name: "Product 1",
            product_id: 5,
            product_uom_qty: 5,
            price_unit: 100,
            price_total: 500,
            discount: 0,
            qty_delivered: 0,
            qty_invoiced: 0,
            qty_to_invoice: 5,
            display_type: false,
            name: "Product 1",
            tax_ids: [],
            is_downpayment: false,
            extra_tax_data: {},
            write_date: "2025-07-03 17:04:14",
        };

        const sol2 = {
            id: 2,
            display_name: "Product 2",
            product_id: 6,
            product_uom_qty: 3,
            price_unit: 50,
            price_total: 150,
            discount: 0,
            qty_delivered: 0,
            qty_invoiced: 0,
            qty_to_invoice: 3,
            display_type: false,
            name: "Product 2",
            tax_ids: [],
            is_downpayment: false,
            extra_tax_data: {},
            write_date: "2025-07-03 17:04:14",
        };
        data["sale.order.line"] = [sol1, sol2];

        return data;
    },
});

patch(modelsToLoad, [...modelsToLoad, "sale.order", "sale.order.line"]);
patch(posModels, [...posModels, SaleOrder, SaleOrderLine]);
defineModels([SaleOrder, SaleOrderLine]);
