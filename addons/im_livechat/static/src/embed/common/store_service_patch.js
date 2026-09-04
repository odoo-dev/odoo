import { expirableStorage } from "@im_livechat/core/common/expirable_storage";
import { Store } from "@mail/core/common/store_service";
import { fields } from "@mail/model/export";

import { patch } from "@web/core/utils/patch";

export const GUEST_TOKEN_STORAGE_KEY = "im_livechat_guest_token";
/** @type {import("models").Store} */
const StorePatch = {
    setup() {
        super.setup(...arguments);
        this.activeVisitorLivechats = fields.Many("discuss.channel", {
            inverse: "storeAsActiveVisitorLivechats",
        });
        expirableStorage.onChange(GUEST_TOKEN_STORAGE_KEY, (value) => (this.guest_token = value));
        this.guest_token = expirableStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
        this.onChange(
            () => [this.guest_token],
            function onChangeGuestToken(guestToken) {
                if (guestToken) {
                    expirableStorage.setItem(GUEST_TOKEN_STORAGE_KEY, guestToken);
                    this.store.env.services.bus_service.addChannel(`mail.guest_${guestToken}`);
                    return;
                }
                expirableStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
                this.store.env.services.bus_service.deleteChannel(`mail.guest_${guestToken}`);
            },
            { initialRun: false }
        );
        this.livechat_rule = fields.One("im_livechat.channel.rule");
        this.livechat_available = false;
    },
    onStarted() {
        super.onStarted(...arguments);
        if (this.guest_token) {
            this.ensureInitialized();
        }
    },
};
patch(Store.prototype, StorePatch);
