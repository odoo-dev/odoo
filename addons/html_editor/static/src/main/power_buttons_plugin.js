import { Plugin } from "@html_editor/plugin";
import { baseContainerGlobalSelector } from "@html_editor/utils/base_container";
import { closestBlock } from "@html_editor/utils/blocks";
import { getIframeAdjustedBoundingRect } from "@html_editor/utils/dom_info";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { omit, pick } from "@web/core/utils/objects";
import { debounce } from "@web/core/utils/timing";
import { signal } from "@odoo/owl";
import { PowerButtonsOverlay } from "./power_buttons_overlay";

/** @typedef {import("./powerbox/powerbox_plugin").PowerboxCommand} PowerboxCommand */

/**
 * @typedef {Object} PowerButton
 * @property {string} commandId
 * @property {Object} [commandParams]
 * @property {string} [description] Can be inferred from the user command
 * @property {string} [icon] Can be inferred from the user command
 * @property {string} [iconClass] Can be inferred from the user command
 * @property {string} [text] Mandatory if `icon` is not provided
 * @property {string} [isAvailable] Can be inferred from the user command
 */

/**
 * @typedef {{ commandId: string }[]} power_buttons
 *
 * A power button is added by referencing an existing user command.
 *
 * Example:
 *
 *     resources = {
 *          user_commands: [
 *              {
 *                  id: myCommand,
 *                  run: myCommandFunction,
 *                  description: _t("Apply my command"),
 *                  icon: "bug_report",
 *              },
 *          ],
 *          power_buttons: [
 *              {
 *                  commandId: "myCommand",
 *                  commandParams: { myParam: "myValue" },
 *                  description: _t("Do powerfull stuff"), // overrides the user command's `description`
 *                  // `icon` is derived from the user command
 *              }
 *          ],
 *     };
 */

// Below this size, the power buttons will overlap other menus.
const MIN_WIDTH_FOR_POWER_BUTTONS = 600;

export class PowerButtonsPlugin extends Plugin {
    static id = "powerButtons";
    static dependencies = [
        "baseContainer",
        "selection",
        "position",
        "localOverlay",
        "powerbox",
        "properties",
        "userCommand",
        "hint",
    ];
    /** @type {import("plugins").EditorResources} */
    resources = {
        on_layout_geometry_change_handlers: this.updatePowerButtons.bind(this),
        on_selectionchange_handlers: this.triggerDebouncedUpdatePowerButtons.bind(this),
        on_component_mounted_handlers: this.updatePowerButtons.bind(this),
    };

    setup() {
        this.powerButtons = this.createPowerButtons();
        this.powerButtonsTarget = signal(null);
        this.dependencies.localOverlay.addLocalOverlay(
            "oe-power-buttons-overlay",
            PowerButtonsOverlay,
            {
                powerButtons: this.powerButtons,
                powerButtonsTarget: this.powerButtonsTarget,
                editable: this.editable,
            }
        );
        const shouldDebounce = this.config.debouncePowerbuttons !== false;
        if (shouldDebounce) {
            this.debouncedUpdatePowerButtons = debounce(this.updatePowerButtons.bind(this), 30);
        } else {
            this.debouncedUpdatePowerButtons = this.updatePowerButtons.bind(this);
        }
    }

    createPowerButtons() {
        const composePowerButton = (/**@type {PowerButton} */ item) => {
            const command = this.dependencies.userCommand.getCommand(item.commandId);
            return {
                ...pick(command, "description", "icon", "iconClass"),
                ...omit(item, "commandId", "commandParams"),
                run: () => command.run(item.commandParams),
                isAvailable: (selection) =>
                    [command.isAvailable, item.isAvailable]
                        .filter(Boolean)
                        .every((predicate) => predicate(selection)),
            };
        };

        /** @type {PowerButton[]} */
        const powerButtonsDefinitions = this.getResource("power_buttons");
        // Merge properties from power_button and user_command.
        return powerButtonsDefinitions.map(composePowerButton);
    }

    triggerDebouncedUpdatePowerButtons() {
        this.powerButtonsTarget.set(null);
        this.debouncedUpdatePowerButtons();
    }

    updatePowerButtons() {
        this.powerButtonsTarget.set(null);
        const { documentSelection, editableSelection, documentSelectionIsInEditable } =
            this.dependencies.selection.getSelectionData();
        if (
            !(
                documentSelectionIsInEditable &&
                this.dependencies.selection.editableDocumentHasFocus()
            )
        ) {
            return;
        }
        const block = closestBlock(documentSelection.anchorNode);
        const blockRect = getIframeAdjustedBoundingRect(block);
        const editableRect = this.editable.getBoundingClientRect();
        if (
            documentSelection.isCollapsed &&
            block?.matches(baseContainerGlobalSelector) &&
            editableRect.bottom > blockRect.top &&
            this.editable.offsetWidth >= MIN_WIDTH_FOR_POWER_BUTTONS &&
            !block.style.textAlign &&
            this.dependencies.properties.get(documentSelection.anchorNode, "powerButtons", false)
        ) {
            const direction = closestElement(block, "[dir]")?.getAttribute("dir");
            this.powerButtonsTarget.set({
                block,
                blockRect,
                direction,
                availability: this.powerButtons.map(({ isAvailable }) =>
                    Boolean(isAvailable(editableSelection))
                ),
            });
        }
    }
}
