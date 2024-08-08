import { excalidrawEmbedding } from "@html_editor/others/embedded_components/excalidraw/component/excalidraw";
import { readonlyExcalidrawEmbedding } from "@html_editor/others/embedded_components/excalidraw/component/readonly_excalidraw";
import {
    readonlyTableOfContentEmbedding,
    tableOfContentEmbedding,
} from "@html_editor/others/embedded_components/table_of_content/component/table_of_content";
import { videoEmbedding } from "@html_editor/others/embedded_components/video/component/video";

export const MAIN_EMBEDDINGS = [excalidrawEmbedding, tableOfContentEmbedding, videoEmbedding];
export const READONLY_MAIN_EMBEDDINGS = [
    readonlyExcalidrawEmbedding,
    readonlyTableOfContentEmbedding,
    videoEmbedding,
];
