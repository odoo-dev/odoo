declare module "models" {
    import { MessagingMenu as MessagingMenuClass } from "@mail/core/public_web/messaging_menu/messaging_menu_model";
    import { MessagingMenuUIState as MessagingMenuUIStateClass } from "@mail/core/public_web/messaging_menu/messaging_menu_ui_state_model";
    import { MessagingMenuTab as MessagingMenuTabClass } from "@mail/core/public_web/messaging_menu/messaging_menu_tab_model";

    export interface MessagingMenu extends MessagingMenuClass {}
    export interface MessagingMenuUIState extends MessagingMenuUIStateClass {}
    export interface MessagingMenuTab extends MessagingMenuTabClass {}

    export interface Store {
        MessagingMenu: StaticMailRecord<MessagingMenu, typeof MessagingMenuClass>;
        MessagingMenuUIState: StaticMailRecord<MessagingMenuUIState, typeof MessagingMenuUIStateClass>;
        MessagingMenuTab: StaticMailRecord<MessagingMenuTab, typeof MessagingMenuTabClass>;
    }

    export interface Models {
        MessagingMenu: MessagingMenu;
        MessagingMenuUIState: MessagingMenuUIState;
        MessagingMenuTab: MessagingMenuTab;
    }
}
