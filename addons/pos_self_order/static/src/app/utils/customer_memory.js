/** Only allowlisted display values belong here, never partner IDs or access tokens. */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const VERSION = 1;
const TEXT_FIELDS = ["name", "email", "phoneLocal", "street", "city", "zip"];
const LOCATION_FIELDS = ["phoneCountryId", "countryId", "stateId"];

function normalizeDetails(value) {
    if (!value || typeof value !== "object") {
        return null;
    }
    const details = {};
    for (const field of TEXT_FIELDS) {
        // Older saved details do not contain address fields.
        const text = value[field] === undefined ? "" : value[field];
        if (typeof text !== "string" || text.length > (field === "street" ? 1024 : 320)) {
            return null;
        }
        details[field] = text.trim();
    }
    for (const field of LOCATION_FIELDS) {
        const id = value[field] === undefined ? null : value[field];
        if (id !== null && !(Number.isSafeInteger(id) && id > 0)) {
            return null;
        }
        details[field] = id;
    }
    return details;
}

/** Disabled modes do not even access storage (including its property getter). */
export function createCustomerMemory({ mode, database, configId, getStorage, now = Date.now }) {
    const enabled =
        mode === "mobile" && Boolean(database) && Number.isSafeInteger(configId) && configId > 0;
    const key = `pos_self_order.customer_details.v1:${encodeURIComponent(
        database || ""
    )}:${configId}`;
    const forget = () => {
        if (!enabled) {
            return true;
        }
        try {
            getStorage().removeItem(key);
            return true;
        } catch {
            return false;
        }
    };
    return {
        enabled,
        read() {
            if (!enabled) {
                return null;
            }
            try {
                const raw = getStorage().getItem(key);
                if (!raw) {
                    return null;
                }
                const stored = JSON.parse(raw);
                const details = normalizeDetails(stored?.details);
                if (
                    stored?.version !== VERSION ||
                    !details ||
                    !Number.isFinite(stored.expiresAt) ||
                    stored.expiresAt <= now() ||
                    stored.expiresAt > now() + RETENTION_MS
                ) {
                    forget();
                    return null;
                }
                return details;
            } catch {
                forget();
                return null;
            }
        },
        save(value) {
            if (!enabled) {
                return false;
            }
            const details = normalizeDetails(value);
            if (!details) {
                return false;
            }
            try {
                getStorage().setItem(
                    key,
                    JSON.stringify({
                        version: VERSION,
                        expiresAt: now() + RETENTION_MS,
                        details,
                    })
                );
                return true;
            } catch {
                return false;
            }
        },
        forget,
    };
}
