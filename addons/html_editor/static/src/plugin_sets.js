import { ColorPlugin } from "./color/color_plugin";
import { ColumnPlugin } from "./column/column_plugin";
import { ClipboardPlugin } from "./core/clipboard_plugin";
import { CommentPlugin } from "./core/comment_plugin";
import { DeletePlugin } from "./core/delete_plugin";
import { DomPlugin } from "./core/dom_plugin";
import { FormatPlugin } from "./core/format_plugin";
import { HintPlugin } from "./core/hint_plugin";
import { HistoryPlugin } from "./core/history_plugin";
import { JustifyPlugin } from "./core/justify_plugin";
import { LineBreakPlugin } from "./core/line_break_plugin";
import { OverlayPlugin } from "./core/overlay_plugin";
import { ProtectedNodePlugin } from "./core/protected_node_plugin";
import { SanitizePlugin } from "./core/sanitize_plugin";
import { SelectionPlugin } from "./core/selection_plugin";
import { ShortCutPlugin } from "./core/shortcut_plugin";
import { SplitPlugin } from "./core/split_plugin";
import { TabulationPlugin } from "./core/tabulation_plugin";
import { UnbreakablePlugin } from "./core/unbreakable_plugin";
import { ZwsPlugin } from "./core/zws_plugin";
import { FontPlugin } from "./font/font_plugin";
import { LinkPlugin } from "./link/link_plugin";
import { ListPlugin } from "./list/list_plugin";
import { MediaPlugin } from "./media/media_plugin";
import { PowerboxPlugin } from "./powerbox/powerbox_plugin";
import { QWebPlugin } from "./qweb/qweb_plugin";
import { TablePlugin } from "./table/table_plugin";
import { TableUIPlugin } from "./table/table_ui_plugin";
import { ToolbarPlugin } from "./toolbar/toolbar_plugin";

export const CORE_PLUGINS = [
    ClipboardPlugin,
    CommentPlugin,
    DeletePlugin,
    DomPlugin,
    FormatPlugin,
    HistoryPlugin,
    LineBreakPlugin,
    OverlayPlugin,
    ProtectedNodePlugin,
    SanitizePlugin,
    SelectionPlugin,
    SplitPlugin,
    UnbreakablePlugin,
    ZwsPlugin,
];

export const BASE_PLUGINS = [
    ...CORE_PLUGINS,
    ColorPlugin,
    ColumnPlugin,
    HintPlugin,
    JustifyPlugin,
    LinkPlugin,
    ListPlugin,
    MediaPlugin,
    ShortCutPlugin,
    PowerboxPlugin,
    TablePlugin,
    TableUIPlugin,
    TabulationPlugin,
    ToolbarPlugin,
    FontPlugin, // note: if before ListPlugin, there are a few split tests that fails
];

export const EXTRA_PLUGINS = [...BASE_PLUGINS, QWebPlugin];
