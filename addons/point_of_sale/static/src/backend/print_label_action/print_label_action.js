import { registry } from "@web/core/registry";
import { PrintLabel } from "./print_label/print_label";

async function printer(env, action) {
    const { label_printer } = env.services;
    for (const product of action.params.products) {
        let cnt = 0;
        while (cnt < action.params.quantity) {
            await label_printer.print(PrintLabel, {
                product: product,
                epson_template: action.params.epson_template,
            });
            cnt++;
        }
    }
}

registry.category("actions").add("pos_printer_action", (env, action) => printer(env, action));
