import { _t } from "@web/core/l10n/translation";

/**
 * Steps from wherever the learner is to a list, through the menus of this
 * database. The path comes from the checkpoint's setup
 * (`learning.setup._menu_location`) as `params.menuPath`.
 *
 * Menus are found by their xmlid, which the community apps menu, the
 * enterprise home menu and the top menus all carry.
 *
 * @param {{xmlid: string, name: string}[]} menuPath from the app to the menu item
 * @param {string} listName what the learner finds at the end, e.g. "your products"
 * @returns {import("./lesson_registry").LessonStep[]}
 */
export function menuSteps(menuPath = [], listName) {
    if (!menuPath.length) {
        return [];
    }
    const menuItem = ({ xmlid }) => `[data-menu-xmlid="${xmlid}"]`;
    const [app, ...items] = menuPath;
    const steps = [
        {
            trigger: ".o_navbar_apps_menu button, .o_menu_toggle",
            bubble: _t("Open the apps"),
            content: _t("You will find %(list)s in the %(app)s app. First, show all your apps.", {
                list: listName,
                app: app.name,
            }),
            run: "click",
            // skipped when the apps are already shown
            until: menuItem(app),
        },
        {
            trigger: menuItem(app),
            bubble: _t("Open %s", app.name),
            content: _t("Click %s.", app.name),
            run: "click",
            until: items.length ? menuItem(items[0]) : ".o_action_manager .o_view_controller",
        },
    ];
    items.forEach((item, index) => {
        const next = items[index + 1];
        steps.push({
            trigger: menuItem(item),
            bubble: _t("Click %s", item.name),
            content: next
                ? _t("The menus at the top lead to the lists of the app. Click “%s”.", item.name)
                : _t("Click “%(menu)s”: here are %(list)s.", { menu: item.name, list: listName }),
            run: "click",
            until: next ? menuItem(next) : { trigger: ".o_last_breadcrumb_item", text: item.name },
        });
    });
    return steps;
}
