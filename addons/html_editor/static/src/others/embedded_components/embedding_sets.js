import { embeddedExcalidraw } from "@html_editor/others/embedded_components/excalidraw/component/excalidraw";
import { readonlyEmbeddedExcalidraw } from "@html_editor/others/embedded_components/excalidraw/component/readonly_excalidraw";
import {
    readonlyTableOfContentEmbeddedComponent,
    tableOfContentEmbeddedComponent,
} from "@html_editor/others/embedded_components/table_of_content/component/table_of_content";

export const MAIN_EMBEDDINGS = [embeddedExcalidraw, tableOfContentEmbeddedComponent];
export const READONLY_MAIN_EMBEDDINGS = [
    readonlyEmbeddedExcalidraw,
    readonlyTableOfContentEmbeddedComponent,
];
