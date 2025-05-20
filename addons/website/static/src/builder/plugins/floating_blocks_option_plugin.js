import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { withSequence } from "@html_editor/utils/resource";
import { after, BEGIN } from "@html_builder/utils/option_sequence";
import { DEVICE_VISIBILITY } from "@website/builder/option_sequence";
import {
    FloatingBlocksOption,
    FloatingBlocksBlockOption,
    FloatingBlocksBlockMobileOption,
} from "./floating_blocks_option";
import { renderToElement } from "@web/core/utils/render";

class FloatingBlocksOptionPlugin extends Plugin {
    static id = "floatingBlocksOptionPlugin";
    static dependencies = ["edit_interaction"];
    resources = {
        builder_options: [
            withSequence(after(DEVICE_VISIBILITY), {
                OptionComponent: FloatingBlocksOption,
                selector: ".s_floating_blocks",
            }),
        ],
        builder_actions: {
            floatingBlocksRoundness: {
                getValue: ({ editingElement }) => {
                    for (let x = 0; x <= 5; x++) {
                        if (editingElement.classList.contains(`rounded-${x}`)) {
                            return x;
                        }
                    }
                    return 0;
                },
                apply: ({ editingElement, value }) => {
                    for (let x = 0; x <= 5; x++) {
                        editingElement.classList.remove(`rounded-${x}`);
                    }
                    editingElement.classList.add(`rounded-${value}`);
                },
            },
            addCard: {
                apply: ({ editingElement: el }) => {
                    const newCardEl = renderToElement("website.s_floating_blocks.new_card");
                    const wrapperEl = el.querySelector(".s_floating_blocks_wrapper");
                    wrapperEl.appendChild(newCardEl);
                    newCardEl.scrollIntoView({ behavior: "smooth", block: "center" });
                    this.validateBoxesNumber(el);
                    this.dependencies.edit_interaction.restartInteractions(el);
                },
            },
        },
        clean_for_save_handlers: this.cleanForSave.bind(this),
        normalize_handlers: this.normalize.bind(this),
    };

    cleanForSave({ root }) {
        for (const el of root.querySelectorAll(".s_floating_blocks_wrapper")) {
            const boxesEls = [...el.querySelectorAll(".s_floating_blocks_block")];
            const alertEl = el.querySelector(".s_floating_blocks_alert_empty");
            if (boxesEls.length > 0) {
                alertEl?.remove();
            } else {
                // Special case: by injecting the "No cards" alert ('alertEl'), we
                // prevent the automatic snippet removal during edition. Still, if
                // the user intentionally "saves" the snippet empty, we'll emulate
                // the original editor behavior by removing it here.
                // See also FloatingBlocksOption.setup().
                el.closest(".s_floating_blocks").remove();
            }
        }
    }

    normalize(el) {
        // Counts the blocks and restarts the interaction every time that a
        // block is added, removed or moved. Note that interaction must
        // restart on block movement to get the correct visual effect.
        const wrapperEl = el.closest(".s_floating_blocks_wrapper");
        if (wrapperEl) {
            this.validateBoxesNumber(wrapperEl);
            this.dependencies.edit_interaction.restartInteractions(
                wrapperEl.closest(".s_floating_blocks")
            );
        }
    }

    validateBoxesNumber(el) {
        const boxesEls = [...el.querySelectorAll(".s_floating_blocks_block")];
        el.querySelector(".s_floating_blocks_alert_empty")?.classList.toggle(
            "d-none",
            boxesEls.length > 0
        );
        console.log("validateBoxesNumber", boxesEls.length);
    }
}

class FloatingBlocksBlockOptionPlugin extends Plugin {
    static id = "floatingBlocksBlockOptionPlugin";
    resources = {
        builder_options: [
            withSequence(after(DEVICE_VISIBILITY), {
                OptionComponent: FloatingBlocksBlockOption,
                selector: ".s_floating_blocks .s_floating_blocks_block",
                dropLockWithin: ".s_floating_blocks",
            }),
            withSequence(BEGIN, {
                OptionComponent: FloatingBlocksBlockMobileOption,
                selector: ".s_floating_blocks .s_floating_blocks_block",
                applyTo: ".container-fluid",
            }),
        ],
        dropzone_selector: [
            {
                selector: ".s_floating_blocks_block_grid .o_grid_item",
                dropLockWithin: ".s_floating_blocks_block_grid",
            },
        ],
    };
}

registry.category("website-plugins").add(FloatingBlocksOptionPlugin.id, FloatingBlocksOptionPlugin);
registry
    .category("website-plugins")
    .add(FloatingBlocksBlockOptionPlugin.id, FloatingBlocksBlockOptionPlugin);
