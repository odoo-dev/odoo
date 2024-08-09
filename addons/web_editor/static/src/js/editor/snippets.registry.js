/** @odoo-module **/
import { registry } from "@web/core/registry";


export function registerOption(name, def, options) {
    if (!def.module) {
        def.module = "web_editor";
    }
    return registry.category("snippet_options").add(name, def, options);
}

/**
 * @param {String} optionName
 * @param {Object} params - each key is a callback that returns the new value.
 * The callback takes the option as parameter. `params` can contain every
 * possible key on `registry.category("snippet_options")`.
 * @param {boolean} force [true]
 * @returns snippet option
 *
 * Example of use:
 * 
 * updateOption("container_width", {
 *      Class: () => NewContainerWidth,
 *      selector: (option) => option.selector + ", .o_new_selector",
 *      exclude: (option) => option.exclude + ", #o_post_content *",
 * });
 */
export function updateOption(optionName, params, force = true) {
    const option = registry.category("snippet_options").get(optionName);
    Object.entries(params).forEach(([key, param]) => {
        option[key] = param(option);
    });
    return registry.category("snippet_options").add(optionName, option, { force });
}
