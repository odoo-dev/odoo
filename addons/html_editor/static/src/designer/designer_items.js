import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

/**
 * The icon browser, contributed to the designer tools menu of the systray.
 *
 * The page is served from this addon because the Material Symbols metadata is
 * (ms_icons.py, and the /html_editor/material_symbols_search route that reads
 * it), and web cannot depend on html_editor. The registry is what lets the
 * menu list a page it cannot import: this is the whole point of it being a
 * registry rather than a list of links in the component.
 */
registry.category("designer").add(
    "html_editor.materialSymbols",
    {
        description: _t("Icons"),
        href: "/designer_tools/icons",
    },
    { sequence: 20 }
);
