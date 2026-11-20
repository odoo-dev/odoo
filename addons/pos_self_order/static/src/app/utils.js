export const formatProductName = (product) => {
    const attributes = product.product_template_attribute_value_ids?.map((v) => v.name).join(",");
    return attributes ? `${product.name} (${attributes})` : product.name;
};

export const shouldShowMissingDetails = (product, selectedValues) => {
    if (!product || !product.attribute_line_ids.length) {
        return false;
    }

    const scrollContainerEl = document.getElementById("o-self-scroll-container");
    if (!scrollContainerEl) {
        return false;
    }

    const containerRect = scrollContainerEl.getBoundingClientRect();
    const selection = selectedValues[product.id];

    return product.attribute_line_ids.some((attr) => {
        const attributeEl = document.getElementById(attr.attribute_id.id);

        return (
            attributeEl?.hasAttribute("attr-required") &&
            !selection?.hasValueSelected(attr) &&
            attributeEl.getBoundingClientRect().top < containerRect.top
        );
    });
};

/**
 * Local storage key of the table session (see `SelfOrder._initTableSession`), suffixed by the
 * database name so that sessions of different databases served on the same domain don't clash.
 */
export function getTableSessionStorageKey(configId, tableIdentifier) {
    const db = odoo.info?.db || odoo.__session_info__?.db || "";
    return `pos_table_session_${configId}_${tableIdentifier}${db ? `_${db}` : ""}`;
}

/**
 * Random secret identifying this device within the dining party of a table (table lead,
 * approved guests). The server trusts it as a bearer credential, so it must be unguessable:
 * `crypto.getRandomValues` is used as it is also available outside secure (https) contexts.
 */
export function getOrCreateGuestToken() {
    let token = localStorage.getItem("odoo_pos_self_guest_token");
    if (!token) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("odoo_pos_self_guest_token", token);
    }
    return token;
}
