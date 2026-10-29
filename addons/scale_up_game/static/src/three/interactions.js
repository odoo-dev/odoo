/**
 * Pointer handling for the Three.js canvas (raycasting).
 * Interactive objects are identified by `userData.interactiveId`, never by
 * Three.js object names.
 */

export function setupInteractions(scene, { onClickObject, onClickBackground, onHoverChange }) {
    const { THREE } = scene;
    const canvas = scene.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredId = null;

    function pick(ev) {
        const rect = canvas.getBoundingClientRect();
        pointer.set(
            ((ev.clientX - rect.left) / rect.width) * 2 - 1,
            -((ev.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(pointer, scene.camera);
        const hits = raycaster.intersectObjects(scene.interactives, true);
        for (const hit of hits) {
            let obj = hit.object;
            while (obj) {
                if (obj.userData && obj.userData.interactiveId) {
                    return obj.userData.interactiveId;
                }
                obj = obj.parent;
            }
        }
        return null;
    }

    const onMove = (ev) => {
        const id = pick(ev);
        canvas.style.cursor = id ? "pointer" : "default";
        if (id !== hoveredId) {
            hoveredId = id;
            onHoverChange?.(id);
        }
    };
    const onLeave = () => {
        if (hoveredId !== null) {
            hoveredId = null;
            canvas.style.cursor = "default";
            onHoverChange?.(null);
        }
    };
    const onClick = (ev) => {
        const id = pick(ev);
        if (id) {
            onClickObject?.(id);
        } else {
            onClickBackground?.();
        }
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);

    return function dispose() {
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("click", onClick);
    };
}
