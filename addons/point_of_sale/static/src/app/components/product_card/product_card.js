import { Component, useState } from "@odoo/owl";
import { useLongPress } from "@point_of_sale/app/hooks/long_press_hook";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

export class ProductCard extends Component {
    static template = "point_of_sale.ProductCard";
    static props = {
        product: Object,
        onClick: Function,
        mode: { String, optional: true },
        class: { String, optional: true },
        extraPrice: { String, optional: true },
        slots: { type: Object, optional: true },
    };
    static defaultProps = {
        mode: "product-screen", // product-screen | combo-popup
    };

    setup() {
        this.pos = usePos();
        this.state = useState({ longPressStyle: "" });
        this.longPressHandlers = useLongPress({
            timingCallback: this.handleTimingLongPress.bind(this),
            callback: () => this.pos.onProductInfoClick(this.product),
            endCallback: () => (this.state.longPressStyle = ""),
            delay: 500,
        });
    }

    get containerClasses() {
        return {
            [`o_colorlist_item_color_transparent_${this.color}`]: Boolean(this.color),
            "d-flex align-items-stretch": Boolean(this.productImage),
        };
    }

    get productContentClasses() {
        return {
            "d-flex": this.props.mode === "product-screen",
            "my-1": !(this.props.mode === "combo-popup" && !this.productImage),
        };
    }

    get productNameClasses() {
        return {
            "mt-1": this.props.mode === "combo-popup" && !this.productImage,
            "no-image d-flex justify-content-center align-items-center text-center":
                !this.productImage,
        };
    }

    get product() {
        return this.props.product;
    }

    get color() {
        return (
            this.props.mode === "product-screen" &&
            (this.product.color || this.product.pos_categ_ids?.at(-1)?.color)
        );
    }

    get cartQty() {
        const order = this.pos.getOrder();
        if (!order) {
            return 0;
        }
        return order.qtyInCartByProductTemplate[this.product.id] || 0;
    }

    get productImage() {
        return this.pos.config.show_product_images && this.product.getImageUrl();
    }

    handleTimingLongPress(percent) {
        if (percent < 10) {
            return "";
        }

        const maxSize = 200;
        const size = (percent / 100) * maxSize;

        this.state.longPressStyle = `
            width: ${size}px;
            height: ${size}px;
        `;
    }

    onMouseDown(event) {
        this.longPressHandlers.onMouseDown(event, this.product);
    }

    onTouchStart() {
        this.longPressHandlers.onTouchStart(this.product);
    }
}
