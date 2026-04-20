import { DebugMenu } from "@web/core/debug/debug_menu";

export class BurgerDebugMenu extends DebugMenu {
    static template = "web.BurgerDebugMenu";

    get canDisplay() {
        return true;
    }
}
