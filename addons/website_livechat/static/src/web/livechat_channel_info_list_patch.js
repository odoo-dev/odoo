import { LivechatChannelInfoList } from "@im_livechat/core/web/livechat_channel_info_list";
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
};

patch(LivechatChannelInfoList.prototype, livechatChannelInfoListPatch);
