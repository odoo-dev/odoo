import { ImagePlugin as EditorImagePlugin } from "@html_editor/main/media/image_plugin";

export class ImagePlugin extends EditorImagePlugin {
    resources = {
        ...super.resources,
        toolbar_namespace_providers: [() => "disabled"],
    };
}
