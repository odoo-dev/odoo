declare module "models" {
    export interface DiscussChannel {
        livechatVisitorHistory: { title: string; url: string; visit_datetime: string }[];
        livechatVisitorHistoryRequestId: string|undefined;
        livechatVisitorHistoryStatus:"idle"|"loading"|"ready"|"empty"|"error"|"unavailable";
    }
    export interface LivechatChannel {
        join: (param0: { notify: boolean }) => Promise<void>;
        joinTitle: Readonly<string>;
        leave: (param0: { notify: boolean }) => Promise<void>;
        leaveTitle: Readonly<string>;
    }
    export interface Store {
        goToOldestUnreadLivechatThread: () => boolean;
        livechatChannels: ReturnType<Store['makeCachedFetchData']>;
        livechatSelfExpertises: ReturnType<Store['makeCachedFetchData']>;
        livechatStatusButtons: Readonly<object[]>;
    }
    export interface Thread {
        hasFetchedLivechatSessionData: boolean;
    }
}
