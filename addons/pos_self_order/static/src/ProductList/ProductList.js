/** @odoo-module */

import { Component, onMounted, useRef, useState } from "@odoo/owl";
import { useSelfOrder } from "@pos_self_order/SelfOrderService";
import { useAutofocus } from "@web/core/utils/hooks";
import { formatMonetary } from "@web/views/fields/formatters";
import { NavBar } from "../NavBar/NavBar";
/**
 * @typedef {import("@pos_self_order/jsDocTypes").Product} Product
 * @typedef {import("@pos_self_order/jsDocTypes").Order} Order
 * @typedef {import("@pos_self_order/jsDocTypes").CartItem} CartItem
 */
export class ProductList extends Component {
    static template = "ProductList";
    static components = { NavBar };
    setup() {
        this.state = useState(this.env.state);
        this.private_state = useState({
            selected_tags: new Set(),
            search_is_focused: false,
            search_input: "",
        });
        this.selfOrder = useSelfOrder();
        this.formatMonetary = formatMonetary;
        useAutofocus({ refName: "searchInput", mobile: true });
        const currentProductCard = useRef(`product_${this.state.currentProduct}`);
        onMounted(() => {
            if (this.state.currentProduct) {
                currentProductCard.el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
    }
    /**
     * @returns {Product[]} the list of products that should be displayed
     * @description this function returns the list of products that should be displayed;
     *             it filters the products based on the selected tags and the search input
     */
    filteredProducts = () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return this.props.productList.filter((product) => {
            return (
                this.itemHasAllOfTheTags(product, this.private_state.selected_tags) &&
                this.itemMatchesSearch(product, this.private_state.search_input)
            );
        });
    };

    /**
     * @param {Product} item
     * @param {Set<string>} selected_tags
     * @returns {boolean}
     * @description returns true if the set of selected tags is a subset of the item's tags
     */
    itemHasAllOfTheTags = (item, selected_tags) => {
        return this.setIsSubset(selected_tags, item.tagList);
    };
    /**
     * @param {Product} item
     * @param {string} search_input
     * @returns {boolean}
     * @description returns true if the item matches the search input
     */
    itemMatchesSearch = (item, search_input) => {
        if (!search_input) {
            return true;
        }
        return (
            item.name.toLowerCase().includes(search_input.toLowerCase()) ||
            (item.description_sale &&
                item.description_sale.toLowerCase().includes(search_input.toLowerCase()))
        );
    };

    /**
     * @param {string} tag_name
     * @description this function is called when a tag is clicked; it selects the chosen tag and deselects all the other tags
     */
    selectTag = (tag_name) => {
        // we make it so only one tag can be selected at a time
        if (this.private_state.selected_tags.has(tag_name)) {
            this.private_state.selected_tags.delete(tag_name);
            return;
        }
        // delete this line if you want to be able to select multiple tags ( you will have to change the template too )
        this.private_state.selected_tags.clear();
        this.private_state.selected_tags.add(tag_name);
    };
    /**
     * @description This function is called when the search button is clicked.
     * It sets the state so the search input is focused.
     * It also deselects all the selected tags
     */
    focusSearch = () => {
        this.private_state.search_is_focused = true;
        // we make it so tags are automatically deselected
        // when the search input is focused
        // ( i made it this way because when the search bar opens
        // the tags are not visible anymore ( on the small size of the screen ))
        // also, the tags provide a more vague way to filter the products
        // ( maybe you don't know exactly what you want ), while the search bar
        // is more precise; ex: you want a Coca Cola, not a soda in general
        this.private_state.selected_tags.clear();
    };
    /**
     * @description this function is called when the search input 'x' button is clicked
     */
    closeSearch = () => {
        this.private_state.search_is_focused = false;
        this.private_state.search_input = "";
    };
    /**
     * @param {Set} set1
     * @param {Set} set2
     * @returns
     * @description returns true if set1 is a subset of set2
     *
     * example:
     * set1 = {1, 2, 3}
     * set2 = {1, 2, 3, 4}
     * setIsSubset(set1, set2) returns true
     *
     * set1 = {1, 2, 3}
     * set2 = {1, 2, 4}
     * setIsSubset(set1, set2) returns false
     *
     */
    setIsSubset(set1, set2) {
        for (const item of set1) {
            if (!set2.has(item)) {
                return false;
            }
        }
        return true;
    }
    /**
     * @param { Set } set1
     * @param { Set } set2
     * @returns { boolean }
     * @description returns true if the two sets are equal;
     * the order of the elements in the sets does not matter
     */
    areSetsEqual(set1, set2) {
        return set1.size === set2.size && this.setIsSubset(set1, set2);
    }
}
export default { ProductList };
