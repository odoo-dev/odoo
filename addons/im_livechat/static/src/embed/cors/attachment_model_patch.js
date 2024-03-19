import { Attachment } from "@mail/core/common/attachment_model";
import { patch } from "@web/core/utils/patch";
import { isEmbedLivechatEnabled } from "../common/misc";

patch(Attachment.prototype, {
    get urlQueryParams() {
        if (!isEmbedLivechatEnabled(this.env)) {
            return super.urlQueryParams(...arguments);
        }
        return {
            ...super.urlQueryParams,
            guest_token: this._store.env.services["im_livechat.livechat"].guestToken,
        };
    },
    get urlRoute() {
        if (!isEmbedLivechatEnabled(this.env)) {
            return super.urlRoute(...arguments);
        }
        if (!this.accessToken && this.thread?.model === "discuss.channel") {
            return this.isImage
                ? `/im_livechat/cors/channel/${this.thread.id}/image/${this.id}`
                : `/im_livechat/cors/channel/${this.thread.id}/attachment/${this.id}`;
        }
        return super.urlRoute;
    },
});
