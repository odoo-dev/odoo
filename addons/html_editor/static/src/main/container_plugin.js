import { Plugin } from "../plugin";

export class ContainerNodePlugin extends Plugin {
    static name = "container";
    static shared = [
        "getMainAbsoluteContainer",
        "makeAbsoluteContainer",
        "getAbsoluteContainer",
        "addContainerBefore",
    ];

    setup() {
        // This main container is used to contain a tree of sub containers.
        // By having one parent that contains a tree of containers, it is easy
        // to change the z-index of any container by changing their place in the
        // tree rather than tweaking a z-index number.
        this.mainAbsoluteContainer = this.document.createElement("div");
        this.mainAbsoluteContainer.classList.add("oe-absolute-container");
        this.editable.before(this.mainAbsoluteContainer);
    }
    destroy() {
        super.destroy();
        this.mainAbsoluteContainer.remove();
    }

    getMainAbsoluteContainer() {
        return this.mainAbsoluteContainer;
    }
    /**
     * @param {string} id The id of the container.
     */
    getAbsoluteContainer(id) {
        return this.mainAbsoluteContainer.querySelector(`[data-oe-absolute-container-id="${id}"]`);
    }
    /**
     * Make an absolute container to organise floating elements inside it's own
     * box and z-index isolation.
     *
     * @param {string} containerId An id to add to the container in order to make
     *              the container more visible in the devtool and potentially
     *              add css rules for the container and it's children.
     */
    makeAbsoluteContainer(containerId) {
        const container = this.document.createElement("div");
        container.className = `oe-absolute-container`;
        container.setAttribute("data-oe-absolute-container-id", containerId);
        this.mainAbsoluteContainer.append(container);
        return container;
    }
    /**
     * @param {HTMLElement} containerElement
     * @param {HTMLElement} beforeElement
     */
    addContainerBefore(containerElement, beforeElement) {
        if (beforeElement && beforeElement.isConnected) {
            containerElement.before(beforeElement);
        } else {
            this.mainAbsoluteContainer.append(containerElement);
        }
    }
}
