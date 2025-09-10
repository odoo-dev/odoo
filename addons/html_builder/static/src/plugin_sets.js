import { MAIN_PLUGINS as MAIN_EDITOR_PLUGINS } from "@html_editor/plugin_sets";
import { removePlugins } from "@html_builder/utils/utils";
import { AnchorPlugin } from "./core/anchor/anchor_plugin";
import { BuilderActionsPlugin } from "./core/builder_actions_plugin";
import { BuilderComponentPlugin } from "./core/builder_component_plugin";
import { BuilderOptionsPlugin } from "./core/builder_options_plugin";
import { BuilderOverlayPlugin } from "./core/builder_overlay/builder_overlay_plugin";
import { CachedModelPlugin } from "./core/cached_model_plugin";
import { ClonePlugin } from "./core/clone_plugin";
import { ColorPlugin } from "./core/color_plugin";
import { CoreBuilderActionPlugin } from "./core/core_builder_action_plugin";
import { CompositeActionPlugin } from "./core/composite_action_plugin";
import { CustomizeTabPlugin } from "./core/customize_tab_plugin";
import { DisableSnippetsPlugin } from "./core/disable_snippets_plugin";
import { DragAndDropPlugin } from "./core/drag_and_drop_plugin";
import { DropZonePlugin } from "./core/drop_zone_plugin";
import { DropZoneSelectorPlugin } from "./core/dropzone_selector_plugin";
import { GridLayoutPlugin } from "./core/grid_layout/grid_layout_plugin";
import { MediaWebsitePlugin } from "./core/media_website_plugin";
import { MovePlugin } from "./core/move_plugin";
import { OperationPlugin } from "./core/operation_plugin";
import { OverlayButtonsPlugin } from "./core/overlay_buttons/overlay_buttons_plugin";
import { RemovePlugin } from "./core/remove_plugin";
import { SavePlugin } from "./core/save_plugin";
import { SaveSnippetPlugin } from "./core/save_snippet_plugin";
import { SetupEditorPlugin } from "./core/setup_editor_plugin";
import { VersionControlPlugin } from "./core/version_control_plugin";
import { VisibilityPlugin } from "./core/visibility_plugin";
import { FieldChangeReplicationPlugin } from "./core/field_change_replication_plugin";
import { BuilderContentEditablePlugin } from "./core/builder_content_editable_plugin";
import { ImageFieldPlugin } from "@html_builder/plugins/image_field_plugin";
import { MonetaryFieldPlugin } from "@html_builder/plugins/monetary_field_plugin";
import { Many2OneOptionPlugin } from "@html_builder/plugins/many2one_option_plugin";

const mainEditorPluginsToRemove = [
    "PowerButtonsPlugin",
    "DoubleClickImagePreviewPlugin",
    "SeparatorPlugin",
    "StarPlugin",
    "BannerPlugin",
    "MoveNodePlugin",
    "FontFamilyPlugin",
    // Replaced plugins:
    "ColorPlugin",
];

export const BUILDER_MAIN_PLUGINS = [
    ...removePlugins(MAIN_EDITOR_PLUGINS, mainEditorPluginsToRemove),
    ColorPlugin,
];

export const BUILDER_CORE_PLUGINS = [
    ...BUILDER_MAIN_PLUGINS,
    BuilderOptionsPlugin,
    BuilderActionsPlugin,
    BuilderComponentPlugin,
    OperationPlugin,
    BuilderOverlayPlugin,
    OverlayButtonsPlugin,
    MovePlugin,
    GridLayoutPlugin,
    DragAndDropPlugin,
    RemovePlugin,
    ClonePlugin,
    SaveSnippetPlugin,
    AnchorPlugin,
    DropZonePlugin,
    DisableSnippetsPlugin,
    MediaWebsitePlugin,
    SetupEditorPlugin,
    SavePlugin,
    VisibilityPlugin,
    DropZoneSelectorPlugin,
    CachedModelPlugin,
    CoreBuilderActionPlugin,
    CompositeActionPlugin,
    CustomizeTabPlugin,
    VersionControlPlugin,
    FieldChangeReplicationPlugin,
    BuilderContentEditablePlugin,
    ImageFieldPlugin,
    MonetaryFieldPlugin,
    Many2OneOptionPlugin,
];
