import { TranscriptSender } from "@im_livechat/core/common/transcript_sender";

import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";

patch(TranscriptSender.prototype, {
    setup() {
        super.setup();
        this.livechatService = useService("im_livechat.livechat");
    },
});
