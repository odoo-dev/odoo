/** @odoo-module **/

export function getMockSessionInfo() {
    return {
        cache_hashes: {
            load_menus: "161803",
            translations: "314159",
        },
        currencies: {
            1: { name: "USD", digits: [69, 2], position: "before", symbol: "$" },
            2: { name: "EUR", digits: [69, 2], position: "after", symbol: "€" },
        },
        user_context: {
            lang: "en",
            uid: 7,
            tz: "taht",
        },
        qweb: "owl",
        uid: 7,
        name: "Mitchell",
        username: "The wise",
        is_admin: true,
        is_system: true,
        partner_id: 7,
        // Commit: 3e847fc8f499c96b8f2d072ab19f35e105fd7749
        // to see what user_companies is
        user_companies: {
            allowed_companies: { 1: { id: 1, name: "Hermit" } },
            current_company: 1,
        },
        db: "test",
        server_version: "1.0",
        server_version_info: ["1.0"],
    };
}
