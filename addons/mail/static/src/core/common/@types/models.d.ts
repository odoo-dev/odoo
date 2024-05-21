declare module "models" {
    import { Attachment as AttachmentClass } from "@mail/core/common/attachment_model";
    import { CannedResponse as CannedResponseClass } from "@mail/core/common/canned_response_model";
    import { ChannelMember as ChannelMemberClass } from "@mail/core/common/channel_member_model";
    import { ChatWindow as ChatWindowClass } from "@mail/core/common/chat_window_model";
    import { Composer as ComposerClass } from "@mail/core/common/composer_model";
    import { Country as CountryClass } from "@mail/core/common/country_model";
    import { DiscussApp as DiscussAppClass } from "@mail/core/common/discuss_app_model";
    import { DiscussAppCategory as DiscussAppCategoryClass } from "@mail/core/common/discuss_app_category_model";
    import { Failure as FailureClass } from "@mail/core/common/failure_model";
    import { Follower as FollowerClass } from "@mail/core/common/follower_model";
    import { LinkPreview as LinkPreviewClass } from "@mail/core/common/link_preview_model";
    import { Message as MessageClass } from "@mail/core/common/message_model";
    import { MessageReactions as MessageReactionsClass } from "@mail/core/common/message_reactions_model";
    import { Notification as NotificationClass } from "@mail/core/common/notification_model";
    import { Persona as PersonaClass } from "@mail/core/common/persona_model";
    import { Settings as SettingsClass } from "@mail/core/common/settings_model";
    import { Store as StoreClass } from "@mail/core/common/store_service";
    import { Thread as ThreadClass } from "@mail/core/common/thread_model";
    import { Volume as VolumeClass } from "@mail/core/common/volume_model";
    import { Mention as MentionClass } from "@mail/core/common/mention_model";
    import { Suggestion as SuggestionClass } from "@mail/core/common/suggestion_model";

    // define interfaces for jsdoc, including with patches
    export interface Attachment extends AttachmentClass {}
    export interface Attachment extends CannedResponseClass {}
    export interface ChannelMember extends ChannelMemberClass {}
    export interface ChatWindow extends ChatWindowClass {}
    export interface Composer extends ComposerClass {}
    export interface Country extends CountryClass {}
    export interface DiscussApp extends DiscussAppClass {}
    export interface DiscussAppCategory extends DiscussAppCategoryClass {}
    export interface Failure extends FailureClass {}
    export interface Follower extends FollowerClass {}
    export interface LinkPreview extends LinkPreviewClass {}
    export interface Message extends MessageClass {}
    export interface MessageReactions extends MessageReactionsClass {}
    export interface Notification extends NotificationClass {}
    export interface Persona extends PersonaClass {}
    export interface Settings extends SettingsClass {}
    export interface Store extends StoreClass {}
    export interface Thread extends ThreadClass {}
    export interface Volume extends VolumeClass {}
    export interface Mention extends MentionClass {}
    export interface Suggestion extends SuggestionClass {}

    // required to propagate types in relational fields
    export interface Models {
        "Attachment": Attachment,
        "CannedResponse": CannedResponse,
        "ChannelMember": ChannelMember,
        "ChatWindow": ChatWindow,
        "Composer": Composer,
        "Country": Country,
        "DiscussApp": DiscussApp,
        "DiscussAppCategory": DiscussAppCategory,
        "Failure": Failure,
        "Follower": Follower,
        "LinkPreview": LinkPreview,
        "Message": Message,
        "MessageReactions": MessageReactions,
        "Notification": Notification,
        "Persona": Persona,
        "Settings": Settings,
        "Store": Store,
        "Thread": Thread,
        "Volume": Volume,
        "Mention": Mention,
        "Suggestion": Suggestion,
    }
}
