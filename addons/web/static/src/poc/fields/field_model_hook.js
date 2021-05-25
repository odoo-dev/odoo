/** @odoo-module **/

import { useModel } from "@web/core/model/model_hook";
import { FieldModel } from "./field_model";

const { useEnv, useSubEnv } = owl.hooks;

/**
 * @returns {FieldModel}
 */
export function useFieldModel() {
    const env = useEnv();

    let fieldModel = env.fieldModel;
    if (!fieldModel) {
        fieldModel = useModel(FieldModel);
        useSubEnv({ fieldModel });
    }

    return fieldModel;
}
