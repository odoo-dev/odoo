import { LivechatChannelInfoList } from "@im_livechat/core/web/livechat_channel_info_list";
import { formatDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

/** @type {import("models").ChannelMember} */
const livechatChannelInfoListPatch = {
    get recentConversations() {
        return (
            this.props.thread.livechat_visitor_id?.discuss_channel_ids?.filter(
                (channel) => channel?.id !== this.props.thread.id
            ) || []
        );
    },
    CLOSED_ON_TEXT(thread) {
        return _t("(closed on: %(date)s)", { date: formatDateTime(thread.livechat_end_dt) });
    },
};

patch(LivechatChannelInfoList.prototype, livechatChannelInfoListPatch);
