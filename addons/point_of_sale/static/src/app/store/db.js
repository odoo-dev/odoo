/** @odoo-module */

import { unaccent } from "@web/core/utils/strings";

/* The PosDB holds reference to data that is either
 * - static: does not change between pos reloads
 * - persistent : must stay between reloads ( orders )
 */

/**
 * cache the data in memory to avoid roundtrips to the localstorage
 *
 * NOTE/TODO: Originally, this is a prop of PosDB. However, if we keep it that way,
 * caching will result to infinite loop to calling the reactive callbacks.
 * Another way to solve the infinite loop is to move the instance of PosDB to env.
 * But I'm not sure if there is anything inside the object that needs to be observed,
 * so I guess this strategy is good enough for the moment.
 */
const CACHE = {};

export class PosDB {
    name = "openerp_pos_db"; //the prefix of the localstorage data
    limit = 100; // the maximum number of results returned by a search
    constructor(options) {
        options = options || {};
        this.name = options.name || this.name;
        this.limit = options.limit || this.limit;

        if (options.uuid) {
            this.name = this.name + "_" + options.uuid;
        }

        this.product_by_id = {};
        this.product_by_barcode = {};
        this.product_by_category_id = {};
        this.product_packaging_by_barcode = {};

        this.partner_sorted = [];
        this.partner_by_id = {};
        this.partner_by_barcode = {};
        this.partner_search_strings = {};
        this.partner_write_date = null;

        this.category_products = {};
        this.category_ancestors = {};
        this.category_childs = {};
        this.category_parent = {};
        this.category_search_string = {};
        this.product_ids_to_not_display = [];
    }

    /**
     * sets an uuid to prevent conflict in locally stored data between multiple PoS Configs. By
     * using the uuid of the config the local storage from other configs will not get effected nor
     * loaded in sessions that don't belong to them.
     *
     * @param {string} uuid Unique identifier of the PoS Config linked to the current session.
     */
    set_uuid(uuid) {
        this.name = this.name + "_" + uuid;
    }

    /* returns a list of the category's child categories ids, or an empty list
     * if a category has no childs */
    get_category_childs_ids(categ_id) {
        return this.category_childs[categ_id] || [];
    }
    /* returns a list of all ancestors (parent, grand-parent, etc) categories ids
     * starting from the root category to the direct parent */
    get_category_ancestors_ids(categ_id) {
        return this.category_ancestors[categ_id] || [this.root_category_id];
    }
    /* returns the parent category's id of a category, or the root_category_id if no parent.
     * the root category is parent of itself. */
    get_category_parent_id(categ_id) {
        return this.category_parent[categ_id] || this.root_category_id;
    }
    addProductIdsToNotDisplay(product_ids) {
        this.product_ids_to_not_display = this.product_ids_to_not_display.concat(product_ids);
    }

    /* loads a record store from the database. returns default if nothing is found */
    load(store, deft) {
        if (CACHE[store] !== undefined) {
            return CACHE[store];
        }
        var data = localStorage[this.name + "_" + store];
        if (data !== undefined && data !== "") {
            data = JSON.parse(data);
            CACHE[store] = data;
            return data;
        } else {
            return deft;
        }
    }
    /* saves a record store to the database */
    save(store, data) {
        localStorage[this.name + "_" + store] = JSON.stringify(data);
        CACHE[store] = data;
    }
    _product_search_string(product) {
        var str = product.display_name;
        if (product.barcode) {
            str += "|" + product.barcode;
        }
        if (product.default_code) {
            str += "|" + product.default_code;
        }
        if (product.description) {
            str += "|" + product.description;
        }
        if (product.description_sale) {
            str += "|" + product.description_sale;
        }
        str = product.id + ":" + str.replace(/[\n:]/g, "") + "\n";
        return str;
    }
    add_products(products) {
        var stored_categories = this.product_by_category_id;

        if (!(products instanceof Array)) {
            products = [products];
        }
        for (var i = 0, len = products.length; i < len; i++) {
            var product = products[i];
            if (product.id in this.product_by_id) {
                continue;
            }
            if (product.available_in_pos) {
                var search_string = unaccent(this._product_search_string(product));
                const all_categ_ids = product.pos_categ_ids.length
                    ? product.pos_categ_ids
                    : [this.root_category_id];
                product.product_tmpl_id = product.product_tmpl_id[0];
                for (const categ_id of all_categ_ids) {
                    if (!stored_categories[categ_id]) {
                        stored_categories[categ_id] = [];
                    }
                    stored_categories[categ_id].push(product.id);

                    if (this.category_search_string[categ_id] === undefined) {
                        this.category_search_string[categ_id] = "";
                    }
                    this.category_search_string[categ_id] += search_string;

                    var ancestors = this.get_category_ancestors_ids(categ_id) || [];

                    for (var j = 0, jlen = ancestors.length; j < jlen; j++) {
                        var ancestor = ancestors[j];
                        if (!stored_categories[ancestor]) {
                            stored_categories[ancestor] = [];
                        }
                        stored_categories[ancestor].push(product.id);

                        if (this.category_search_string[ancestor] === undefined) {
                            this.category_search_string[ancestor] = "";
                        }
                        this.category_search_string[ancestor] += search_string;
                    }
                }
            }
            this.product_by_id[product.id] = product;
            if (product.barcode && product.active) {
                this.product_by_barcode[product.barcode] = product;
            }
        }
    }
    /**
     * Removes all products specified by their id.
     * @param {integer[]} products_id
     */
    remove_products(products_id) {
        if (!(products_id instanceof Array)) {
            products_id = [products_id];
        }
        products_id.forEach((product_id) => {
            if (product_id === undefined || product_id === null) {
                return;
            }
            const product = this.product_by_id[product_id];
            if (!product) {
                return;
            }
            if (product.available_in_pos) {
                const product_search_string = unaccent(this._product_search_string(product));
                const all_categ_ids = product.pos_categ_ids.length
                    ? product.pos_categ_ids
                    : [this.root_category_id];

                for (const categ_id of all_categ_ids) {
                    this.remove_product_from_category(product.id, product_search_string, categ_id);
                    const categ_ancestors_id = this.get_category_ancestors_ids(categ_id) || [];
                    categ_ancestors_id.forEach((ancestor_id) => {
                        this.remove_product_from_category(
                            product.id,
                            product_search_string,
                            ancestor_id
                        );
                    });
                }
            }
            delete this.product_by_id[product.id];
            if (product.barcode) {
                delete this.product_by_barcode[product.barcode];
            }
        });
    }
    remove_product_from_category(product_id, product_search_string, categ_id) {
        const stored_categories = this.product_by_category_id;
        if (stored_categories[categ_id]) {
            this._remove_all_occurrences_from_array(stored_categories[categ_id], product_id);
            if (stored_categories[categ_id].length === 0) {
                delete stored_categories[categ_id];
            }
        }

        if (this.category_search_string[categ_id]) {
            this.category_search_string[categ_id] = this.category_search_string[categ_id].replace(
                product_search_string,
                ""
            );
        }
        if (!this.category_search_string[categ_id]) {
            delete this.category_search_string[categ_id];
        }
    }
    _remove_all_occurrences_from_array(array, element) {
        for (let i = array.length - 1; i >= 0; i--) {
            if (array[i] === element) {
                array.splice(i, 1);
            }
        }
    }
    add_packagings(productPackagings) {
        productPackagings?.forEach((productPackaging) => {
            if (productPackaging.product_id[0] in this.product_by_id) {
                this.product_packaging_by_barcode[productPackaging.barcode] = productPackaging;
            }
        });
    }
    get_partner_write_date() {
        return this.partner_write_date || "1970-01-01 00:00:00";
    }
    get_partner_by_id(id) {
        return this.partner_by_id[id];
    }
    get_partner_by_barcode(barcode) {
        return this.partner_by_barcode[barcode];
    }
    get_partners_sorted(max_count) {
        max_count = max_count
            ? Math.min(this.partner_sorted.length, max_count)
            : this.partner_sorted.length;
        var partners = [];
        for (var i = 0; i < max_count; i++) {
            partners.push(this.partner_by_id[this.partner_sorted[i]]);
        }
        return partners;
    }
    search_partner(query) {
        try {
            // eslint-disable-next-line no-useless-escape
            query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, ".");
            query = query.replace(/ /g, ".+");
            var re = RegExp("([0-9]+):.*?" + unaccent(query), "gi");
        } catch {
            return [];
        }
        var results = [];
        const searchStrings = Object.values(this.partner_search_strings).reverse();
        let searchString = searchStrings.pop();
        while (searchString && results.length < this.limit) {
            var r = re.exec(searchString);
            if (r) {
                var id = Number(r[1]);
                results.push(this.get_partner_by_id(id));
            } else {
                searchString = searchStrings.pop();
            }
        }
        return results;
    }
    /* removes all the data from the database. TODO : being able to selectively remove data */
    clear() {
        for (var i = 0, len = arguments.length; i < len; i++) {
            localStorage.removeItem(this.name + "_" + arguments[i]);
        }
    }
    /* this internal methods returns the count of properties in an object. */
    _count_props(obj) {
        var count = 0;
        for (var prop in obj) {
            if (Object.hasOwnProperty.call(obj, prop)) {
                count++;
            }
        }
        return count;
    }
    get_product_by_id(id) {
        return this.product_by_id[id];
    }
    get_product_by_barcode(barcode) {
        if (this.product_by_barcode[barcode]) {
            return this.product_by_barcode[barcode];
        } else if (this.product_packaging_by_barcode[barcode]) {
            return this.product_by_id[this.product_packaging_by_barcode[barcode].product_id[0]];
        }
        return undefined;
    }

    shouldAddProduct(product, list) {
        return (
            product.active &&
            product.available_in_pos &&
            !list.includes(product) &&
            !this.product_ids_to_not_display.includes(product.id)
        );
    }

    get_product_by_category(category_id) {
        var product_ids = this.product_by_category_id[category_id];
        var list = [];
        if (product_ids) {
            for (var i = 0, len = Math.min(product_ids.length, this.limit); i < len; i++) {
                const product = this.product_by_id[product_ids[i]];
                if (!this.shouldAddProduct(product, list)) {
                    continue;
                }
                list.push(product);
            }
        }
        return list;
    }
    /* returns a list of products with :
     * - a category that is or is a child of category_id,
     * - a name, package or barcode containing the query (case insensitive)
     */
    search_product_in_category(category_id, query) {
        try {
            // eslint-disable-next-line no-useless-escape
            query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g, ".");
            query = query.replace(/ /g, ".+");
            var re = RegExp("([0-9]+):.*?" + unaccent(query), "gi");
        } catch {
            return [];
        }
        var results = [];
        for (var i = 0; i < this.limit; i++) {
            var r = re.exec(this.category_search_string[category_id]);
            if (r) {
                var id = Number(r[1]);
                const product = this.get_product_by_id(id);
                if (!this.shouldAddProduct(product, results)) {
                    continue;
                }
                results.push(product);
            } else {
                break;
            }
        }
        return results;
    }
    /**
     * returns true if the product belongs to one of the provided categories
     * or one of its child categories.
     * @param {number[]} category_ids
     * @param {number} product_id
     * @returns {boolean}
     */
    is_product_in_category(category_ids, product_id) {
        const product_categ_ids = this.get_product_by_id(product_id).pos_categ_ids;
        return this.any_of_is_subcategory(product_categ_ids, category_ids);
    }

    /**
     * Recursively check if any of `subcategory_ids` belongs to any of the `category_ids`
     * @param {number[]} subcategory_ids
     * @param {number[]} category_ids
     * @returns {boolean}
     */
    any_of_is_subcategory(subcategory_ids, category_ids) {
        return subcategory_ids.some((subcategory_id) =>
            this.is_subcategory(subcategory_id, category_ids)
        );
    }
    /**
     * Recursively check if a `subcategory_id` a child of any of the provided `category_ids`.
     * @param {number} subcategory_id
     * @param {number[]} category_ids
     * @returns {boolean}
     */
    is_subcategory(subcategory_id, category_ids) {
        const check = (categ_id) => categ_id && this.is_subcategory(categ_id, category_ids);
        return (
            category_ids.includes(Number(subcategory_id)) ||
            check(this.get_category_parent_id(subcategory_id))
        );
    }

    /* paid orders */
    add_order(order) {
        var order_id = order.uid;
        var orders = this.load("orders", []);

        // if the order was already stored, we overwrite its data
        for (var i = 0, len = orders.length; i < len; i++) {
            if (orders[i].id === order_id) {
                orders[i].data = order;
                this.save("orders", orders);
                return order_id;
            }
        }

        // Only necessary when we store a new, validated order. Orders
        // that where already stored should already have been removed.
        this.remove_unpaid_order(order);

        orders.push({ id: order_id, data: order });
        this.save("orders", orders);
        return order_id;
    }
    remove_order(order_id) {
        var orders = this.load("orders", []);
        orders = orders.filter((order) => order.id !== order_id);
        this.save("orders", orders);
    }
    remove_all_orders() {
        this.save("orders", []);
    }
    get_orders() {
        return this.load("orders", []);
    }
    get_order(order_id) {
        var orders = this.get_orders();
        for (var i = 0, len = orders.length; i < len; i++) {
            if (orders[i].id === order_id) {
                return orders[i];
            }
        }
        return undefined;
    }

    /* working orders */
    save_unpaid_order(order) {
        var order_id = order.uid;
        var orders = this.load("unpaid_orders", []);
        var serialized = order.export_as_JSON();

        for (var i = 0; i < orders.length; i++) {
            if (orders[i].id === order_id) {
                orders[i].data = serialized;
                this.save("unpaid_orders", orders);
                return order_id;
            }
        }

        orders.push({ id: order_id, data: serialized });
        this.save("unpaid_orders", orders);
        return order_id;
    }
    remove_unpaid_order(order) {
        var orders = this.load("unpaid_orders", []);
        orders = orders.filter((o) => o.id !== order.uid);
        this.save("unpaid_orders", orders);
    }
    remove_all_unpaid_orders() {
        this.save("unpaid_orders", []);
    }
    get_unpaid_orders() {
        var saved = this.load("unpaid_orders", []);
        var orders = [];
        for (var i = 0; i < saved.length; i++) {
            orders.push(saved[i].data);
        }
        return orders;
    }
    /**
     * Return the orders with requested ids if they are unpaid.
     * @param {array<number>} ids order_ids.
     * @return {array<object>} list of orders.
     */
    get_unpaid_orders_to_sync(ids) {
        const savedOrders = this.load("unpaid_orders", []);
        return savedOrders.filter(
            (order) =>
                ids.includes(order.id) &&
                (order.data.server_id || order.data.lines.length || order.data.statement_ids.length)
        );
    }
    /**
     * Add a given order to the orders to be removed from the server.
     *
     * If an order is removed from a table it also has to be removed from the server to prevent it from reapearing
     * after syncing. This function will add the server_id of the order to a list of orders still to be removed.
     * @param {object} order object.
     */
    set_order_to_remove_from_server(order) {
        if (order.server_id === undefined) {
            return;
        }
        const to_remove = new Set(
            [this.load("unpaid_orders_to_remove", []), order.server_id].flat()
        );
        this.save("unpaid_orders_to_remove", [...to_remove]);
    }
    /**
     * Get a list of server_ids of orders to be removed.
     * @return {array<number>} list of server_ids.
     */
    get_ids_to_remove_from_server() {
        return this.load("unpaid_orders_to_remove", []);
    }
    /**
     * Remove server_ids from the list of orders to be removed.
     * @param {array<number>} ids
     */
    set_ids_removed_from_server(ids) {
        var to_remove = this.load("unpaid_orders_to_remove", []);

        to_remove = to_remove.filter((id) => !ids.includes(id));
        this.save("unpaid_orders_to_remove", to_remove);
    }
}
