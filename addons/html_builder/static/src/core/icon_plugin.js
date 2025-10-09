import { IconPlugin as EditorIconPlugin } from "@html_editor/main/media/icon_plugin";

export class IconPlugin extends EditorIconPlugin {
    resources = {
        ...super.resources,
        toolbar_namespace_providers: [() => "disabled"],
    };
}
