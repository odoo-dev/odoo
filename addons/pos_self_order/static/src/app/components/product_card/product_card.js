import { Component, useRef } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/app/services/self_order_service";
import { useService, useForwardRefToParent } from "@web/core/utils/hooks";
import { ProductInfoPopup } from "@pos_self_order/app/components/product_info_popup/product_info_popup";

export class ProductCard extends Component {
    static template = "pos_self_order.ProductCard";
    static props = ["productTemplate", "currentProductCard?"];

    selfRef = useRef("selfProductCard");
    currentProductCardRef = useRef("currentProductCard");

    setup() {
        this.selfOrder = useSelfOrder();
        this.router = useService("router");
        this.dialog = useService("dialog");

        useForwardRefToParent("currentProductCard");
    }

    flyToCart() {
        const productCardEl = this.selfRef.el;
        const toOrder = document.querySelector(".to-order");
        if (!productCardEl || !toOrder || window.getComputedStyle(toOrder).display === "none") {
            return;
        }

        const ANIMATION_CONFIG = {
            flyDuration: "900ms",
            cartDuration: "200ms",
            flyEasing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            initialScale: "1.05",
            finalScale: "0.3",
            cartScale: "1.08",
            rotation: "5deg",
        };

        const cardRect = productCardEl.getBoundingClientRect();
        const toOrderRect = toOrder.getBoundingClientRect();
        const offsetTop = toOrderRect.top - cardRect.top;
        const offsetLeft = toOrderRect.left - cardRect.left;

        const clonedCard = productCardEl.cloneNode(true);
        const initialStyles = {
            top: `${cardRect.top}px`,
            left: `${cardRect.left}px`,
            width: `${cardRect.width}px`,
            height: `${cardRect.height}px`,
            transform: "scale(1)",
            opacity: "1",
            transition: `all ${ANIMATION_CONFIG.flyDuration} ${ANIMATION_CONFIG.flyEasing}`,
            pointerEvents: "none",
        };

        Object.assign(clonedCard.style, initialStyles);
        clonedCard.classList.add("position-fixed", "shadow-lg", "z-1");

        const infosDiv = clonedCard.querySelector(".product-infos");
        if (infosDiv) {
            Object.assign(infosDiv.style, {
                transform: "scale(0.9)",
                transition: `all ${ANIMATION_CONFIG.flyDuration} ${ANIMATION_CONFIG.flyEasing}`,
            });
        }

        document.body.appendChild(clonedCard);

        requestAnimationFrame(() => {
            clonedCard.style.transform = `scale(${ANIMATION_CONFIG.initialScale})`;
            requestAnimationFrame(() => {
                clonedCard.style.transform = `
                    translateY(${offsetTop}px) 
                    translateX(${offsetLeft}px) 
                    scale(${ANIMATION_CONFIG.finalScale}) 
                    rotate(${ANIMATION_CONFIG.rotation})
                `;
                clonedCard.style.opacity = "0";

                if (infosDiv) {
                    infosDiv.style.transform = "scale(0.7)";
                }

                const cartAnimation = {
                    transform: `scale(${ANIMATION_CONFIG.cartScale})`,
                    transition: `transform ${ANIMATION_CONFIG.cartDuration} ${ANIMATION_CONFIG.flyEasing}`,
                };
                Object.assign(toOrder.style, cartAnimation);

                setTimeout(() => {
                    Object.assign(toOrder.style, {
                        transform: "scale(1)",
                        transition: `transform ${ANIMATION_CONFIG.cartDuration} ${ANIMATION_CONFIG.flyEasing}`,
                    });
                }, parseInt(ANIMATION_CONFIG.cartDuration));
            });
        });

        clonedCard.addEventListener("transitionend", () => {
            clonedCard.remove();
        });
    }

    get isAvailable() {
        if (this.props.productTemplate.pos_categ_ids.length === 0) {
            return true;
        }

        return this.props.productTemplate.pos_categ_ids.some((categ) =>
            this.selfOrder.isCategoryAvailable(categ.id)
        );
    }

    scaleUpPrice() {
        const priceElement = document.querySelector(".total-price");

        if (!priceElement) {
            return;
        }

        priceElement.classList.add("scale-up");

        setTimeout(() => {
            priceElement.classList.remove("scale-up");
        }, 600);
    }

    async selectProduct(qty = 1) {
        const product = this.props.productTemplate;

        if (!product.self_order_available || !this.isAvailable) {
            return;
        }

        if (product.isCombo()) {
            this.router.navigate("combo_selection", { id: product.id });
        } else if (product.isConfigurable()) {
            this.router.navigate("product", { id: product.id });
        } else {
            if (!this.selfOrder.ordering) {
                return;
            }
            this.flyToCart();
            this.scaleUpPrice();

            this.selfOrder.addToCart(product, qty);
        }
    }

    showProductInfo() {
        this.dialog.add(ProductInfoPopup, {
            productTemplate: this.props.productTemplate,
            addToCart: (qty) => {
                this.selectProduct(qty);
            },
        });
    }
}
