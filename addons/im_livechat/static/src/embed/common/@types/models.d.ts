declare module "models" {
    export interface Message {
        disableChatbotAnswers: boolean;
    }
    export interface Store {
        active_livechat_channel: LivechatChannel;
        activeLivechats: Thread[];
        guest_token: null;
        livechat_rule: LivechatChannelRule;
    }
    export interface Thread {
        _toggleChatbot: boolean;
        chatbot: Chatbot;
        chatbotTypingMessage: Message;
        hasWelcomeMessage: Readonly<boolean>;
        isLastMessageFromCustomer: Readonly<boolean>;
        livechat_operator_id: Persona;
        livechatWelcomeMessage: Message;
        readyToSwapDeferred: Deferred;
        requested_by_operator: boolean;
        storeAsActiveLivechats: Store;
    }
}
