/**
 * Self-Order Session Timeout (Stateless HMAC Architecture)
 *
 * Session lifecycle (mobile + pay-after-meal only):
 *
 * 1. FIRST QR SCAN:
 *    - JS calls /pos-self/session/create ONCE to get an HMAC-signed token
 *    - JS stores { table_identifier, token, expires_at } in localStorage
 *    - Client-side countdown timer runs locally (zero network polling)
 *
 * 2. ORDER GUARD:
 *    - Client-side: Every time customer tries to place an order, JS checks localStorage.
 *      If missing or expired, the order is blocked with a danger notification and the
 *      banner is shown on the LandingPage.
 *    - Backend: The HMAC token is sent with the order and validated cryptographically.
 *      Even if someone tampers with localStorage, the server rejects the order.
 *
 * 3. RESCAN / NEW TABLE:
 *    - If a different table is scanned: older key is removed and new table token saved.
 *    - If the same table is rescanned: new HMAC token and expiry timestamp are saved.
 */

import { SelfOrder } from "@pos_self_order/app/services/self_order_service";
import { patch } from "@web/core/utils/patch";
import { rpc } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";
import { getTableSessionStorageKey } from "@pos_self_order_secure/app/utils";

patch(SelfOrder.prototype, {
    async setup(...args) {
        this._isSessionExpired = false;
        await super.setup(...args);
        if (this._isSessionTimeoutEnabled()) {
            await this._initTableSession();
        }
    },

    get isSessionExpired() {
        if (!this._isSessionExpired || !this._isDineInOrder()) {
            return false;
        }
        return Boolean(this._isSessionExpired);
    },

    _isSessionTimeoutEnabled() {
        return (
            this.config &&
            this.config.self_order_secure_session &&
            this.config.self_ordering_mode === "mobile" &&
            this.config.self_ordering_pay_after === "meal"
        );
    },

    _getStoredSession(tableIdentifier) {
        if (!tableIdentifier) {
            return null;
        }
        try {
            const raw = localStorage.getItem(
                getTableSessionStorageKey(this.config.id, tableIdentifier)
            );
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            console.warn("Failed to read stored table session from localStorage:", err);
            return null;
        }
    },

    _saveStoredSession(tableIdentifier, data) {
        if (!tableIdentifier) {
            return;
        }
        try {
            localStorage.setItem(
                getTableSessionStorageKey(this.config.id, tableIdentifier),
                JSON.stringify(data)
            );
        } catch (err) {
            console.warn("Failed to save table session to localStorage:", err);
        }
    },

    _clearStoredSession(tableIdentifier) {
        if (!tableIdentifier) {
            return;
        }
        try {
            localStorage.removeItem(getTableSessionStorageKey(this.config.id, tableIdentifier));
        } catch (err) {
            console.warn("Failed to remove table session from localStorage:", err);
        }
    },

    // -------------------------------------------------------------------------
    // Session Initialization / Scan
    // -------------------------------------------------------------------------

    async _initTableSession() {
        const tableIdentifier = this.currentTableIdentifier;
        if (!tableIdentifier) {
            return;
        }

        // Check if current URL was loaded from a QR scan flag (&qr=1)
        const url = new URL(window.location.href);
        const hasScanParam = url.searchParams.has("qr");
        if (hasScanParam) {
            url.searchParams.delete("qr");
            window.history.replaceState({}, "", url.toString());
        }

        // If a fresh QR scan was detected via URL parameter:
        if (hasScanParam) {
            await this._createAndStoreSession(tableIdentifier);
            return;
        }

        // --- NOT a fresh QR scan (e.g. page refresh / direct navigation) ---
        const stored = this._getStoredSession(tableIdentifier);

        // Case 1: No localStorage entry found for this table -> block and show expired banner
        if (!stored) {
            this._onSessionExpired();
            return;
        }

        // Case 2: Check expiry date directly from localStorage
        const expiresAtMs = stored.expires_at || 0;
        const now = Date.now();

        // If time already expired in localStorage
        if (!expiresAtMs || now >= expiresAtMs) {
            this._onSessionExpired();
            return;
        }

        // Active session: use local storage data directly (no server requests)
        this._expiresAtMs = expiresAtMs;
        this._isSessionExpired = false;
        this._startSessionTimer();
    },

    async _createAndStoreSession(tableIdentifier) {
        try {
            const res = await rpc("/pos-self/session/create", {
                config_id: this.config.id,
                table_identifier: tableIdentifier,
                access_token: this.access_token,
            });

            if (!res || res.status !== "open" || !res.token) {
                return;
            }

            const expiresAtMs = res.expires_at_ms;

            this._expiresAtMs = expiresAtMs;
            this._isSessionExpired = false;

            this._saveStoredSession(tableIdentifier, {
                token: res.token,
                expires_at: expiresAtMs,
            });

            this._startSessionTimer();
        } catch (err) {
            console.error("Failed to obtain HMAC table session token:", err);
            this.handleErrorNotification(err);
        }
    },

    // -------------------------------------------------------------------------
    // Local Session Countdown (No Server Polling)
    // -------------------------------------------------------------------------

    _startSessionTimer() {
        if (this._sessionTimer) {
            clearInterval(this._sessionTimer);
        }

        this._sessionTimer = setInterval(() => {
            if (this._isSessionExpired) {
                clearInterval(this._sessionTimer);
                this._sessionTimer = null;
                return;
            }

            const now = Date.now();
            if (this._expiresAtMs && now >= this._expiresAtMs) {
                this._onSessionExpired();
            }
        }, 1_000);
    },

    _onSessionExpired() {
        this._isSessionExpired = true;

        if (this._sessionTimer) {
            clearInterval(this._sessionTimer);
            this._sessionTimer = null;
        }
    },

    _isDineInOrder() {
        if (!this.config) {
            return false;
        }
        if (this.config.use_presets) {
            const preset = this.currentOrder?.preset_id;
            if (preset) {
                return preset.service_at === "table";
            }
        }
        return this.config.self_ordering_service_mode === "table";
    },

    _checkOrderPermission() {
        if (!this._isDineInOrder()) {
            return true;
        }

        const tableIdentifier = this.currentTableIdentifier;
        const stored = this._getStoredSession(tableIdentifier);

        let isBlocked = false;

        // Block if no localStorage key found, or token/expires_at missing
        if (!stored || !stored.token || !stored.expires_at) {
            isBlocked = true;
        } else {
            // Block if time is expired
            const expiresAtMs = stored.expires_at;
            if (isNaN(expiresAtMs) || Date.now() >= expiresAtMs) {
                isBlocked = true;
            }
        }

        if (isBlocked || this._isSessionExpired) {
            this._onSessionExpired();
            if (this.notification) {
                this.notification.add(
                    _t(
                        "Your session has expired. Please scan the QR code again to continue ordering."
                    ),
                    { type: "danger" }
                );
            }
            return false;
        }

        return true;
    },

    async _sendDraftOrderToServer() {
        if (this._isSessionTimeoutEnabled()) {
            if (!this._checkOrderPermission()) {
                return false;
            }
        }
        return super._sendDraftOrderToServer();
    },

    async confirmOrder() {
        if (this._isSessionTimeoutEnabled()) {
            if (!this._checkOrderPermission()) {
                return;
            }
        }
        return super.confirmOrder();
    },
});
