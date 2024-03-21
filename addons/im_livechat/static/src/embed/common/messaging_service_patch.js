import { FEATURES } from "@im_livechat/embed/common/features";
import { SESSION_STATE } from "@im_livechat/embed/common/livechat_service";
import { feature } from "@mail/core/common/features";

import { Messaging, messagingService } from "@mail/core/common/messaging_service";

import { session } from "@web/session";

feature(FEATURES.EMBED_LIVECHAT)
    .registerIIFE(() => messagingService.dependencies.push("im_livechat.livechat"))
    .registerPatch(Messaging.prototype, {
        async initialize() {
            const livechatService = this.env.services["im_livechat.livechat"];
            await livechatService.initializedDeferred;
            if (livechatService.state === SESSION_STATE.PERSISTED) {
                await super.initialize();
                if (!livechatService.thread) {
                    livechatService.leave({ notifyServer: false });
                }
                return;
            }
            const messagingData = {
                Store: { settings: {} },
                Thread: [],
            };
            if (session.livechatData?.options.current_partner_id) {
                messagingData.Store.current_partner = {
                    id: session.livechatData.options.current_partner_id,
                };
            }
            if (livechatService.savedState?.threadData) {
                messagingData.Thread.push(livechatService.savedState.threadData);
            }
            this.store.insert(messagingData);
            this.isReady.resolve();
        },
        get initMessagingParams() {
            const params = super.initMessagingParams;
            params.init_messaging.channel_types = ["livechat"];
            return params;
        },
    });
