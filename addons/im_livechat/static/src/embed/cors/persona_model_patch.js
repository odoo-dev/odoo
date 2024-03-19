import { Persona } from "@mail/core/common/persona_model";
import { assignDefined } from "@mail/utils/common/misc";

import { patch } from "@web/core/utils/patch";
import { url } from "@web/core/utils/urls";
import { isEmbedLivechatEnabled } from "../common/misc";

patch(Persona.prototype, {
    get avatarUrl() {
        if (!isEmbedLivechatEnabled(this._store.env)) {
            return super.avatarUrl;
        }
        const params = assignDefined(
            {},
            {
                guest_token: this._store.env.services["im_livechat.livechat"].guestToken,
                unique: this.write_date,
            }
        );
        if (this.type === "partner") {
            return url("/im_livechat/cors/web/image", {
                field: "avatar_128",
                id: this.id,
                model: "res.partner",
                ...params,
            });
        }
        if (this.type === "guest") {
            return url("/im_livechat/cors/web/image", {
                field: "avatar_128",
                id: this.id,
                model: "mail.guest",
                ...params,
            });
        }
        return super.avatarUrl;
    },
});
