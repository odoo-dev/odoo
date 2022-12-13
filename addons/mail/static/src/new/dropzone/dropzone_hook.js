/* @odoo-module */

import { registry } from "@web/core/registry";
import { Dropzone } from "./dropzone";
import { onWillDestroy } from "@odoo/owl";

const componentRegistry = registry.category("main_components");

let id = 1;
export function useDropzone(targetRef, onDrop) {
    const dropzoneId = `mail.dropzone_${id++}`;
    componentRegistry.add(dropzoneId, {
        Component: Dropzone,
        props: { onDrop, ref: targetRef },
    });
    onWillDestroy(() => componentRegistry.remove(dropzoneId));
}
