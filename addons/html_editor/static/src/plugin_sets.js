import { ColorPlugin } from "./main/color/color_plugin";
import { ColumnPlugin } from "./main/column_plugin";
import { ClipboardPlugin } from "./core/clipboard_plugin";
import { CommentPlugin } from "./core/comment_plugin";
import { DeletePlugin } from "./core/delete_plugin";
import { DomPlugin } from "./core/dom_plugin";
import { FormatPlugin } from "./core/format_plugin";
import { HintPlugin } from "./main/hint_plugin";
import { HistoryPlugin } from "./core/history_plugin";
import { JustifyPlugin } from "./main/justify_plugin";
import { LineBreakPlugin } from "./core/line_break_plugin";
import { OverlayPlugin } from "./core/overlay_plugin";
import { ProtectedNodePlugin } from "./core/protected_node_plugin";
import { SanitizePlugin } from "./core/sanitize_plugin";
import { SelectionPlugin } from "./core/selection_plugin";
import { ShortCutPlugin } from "./core/shortcut_plugin";
import { SplitPlugin } from "./core/split_plugin";
import { TabulationPlugin } from "./main/tabulation_plugin";
import { UnbreakablePlugin } from "./core/unbreakable_plugin";
import { ZwsPlugin } from "./core/zws_plugin";
import { FontPlugin } from "./main/font/font_plugin";
import { LinkPlugin } from "./main/link/link_plugin";
import { ListPlugin } from "./main/list/list_plugin";
import { MediaPlugin } from "./main/media/media_plugin";
import { PowerboxPlugin } from "./main/powerbox/powerbox_plugin";
import { QWebPlugin } from "./others/qweb_plugin";
import { TablePlugin } from "./main/table/table_plugin";
import { TableUIPlugin } from "./main/table/table_ui_plugin";
import { ToolbarPlugin } from "./main/toolbar/toolbar_plugin";

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

export const MAIN_PLUGINS = [
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

export const EXTRA_PLUGINS = [...MAIN_PLUGINS, QWebPlugin];
