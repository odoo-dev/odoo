import { computed, props, proxy, t, useEffect } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { StateSelectionField, stateSelectionField } from "@web/views/fields/state_selection/state_selection_field";

export class TodoDoneCheckmark extends StateSelectionField {
    static template = "project_todo.TodoDoneCheckmark";
    todoProps = props({
        viewType: t.string().optional(),
    });

    notDoneState = computed(() => this.props.record.data[this.props.name] == "1_done")

    setup() {
        super.setup();
        this.uiService = useService("ui");
        this.stateDone = proxy({
            isDone: false, //This state determines the appearance of the done checkmark and should only be actualized when the mouse leaves it (and atfer the form is loaded)
            notReloadState: false, //used to avoid a change of the checkmark when re-rendering the form
        });
        useEffect(() => {
            if (!this.stateDone.notReloadState) {
                this.stateDone.isDone = this.props.record.data[this.props.name] == '1_done';
            }
        });
    }

    /**
     * @private
     * @param {InputEvent} ev
     */
    actualizeDoneState(ev) {
        this.stateDone.notReloadState = false;
    }

    /**
     * @private
     * @param {InputEvent} ev
     */
    freezeDoneState(ev) {
        this.stateDone.notReloadState = true;
    }

    /**
     * @private
     * @param {InputEvent} ev
     */
    async onDoneToggled(ev) {
        const value = this.props.record.data[this.props.name] != '1_done' ? '1_done' : this.notDoneState();
        if (['card', 'list'].includes(this.todoProps.viewType)) {
            await super.updateRecord(value);
        }
        else {
            await this.props.record.update({
                [this.props.name]: value,
            });
        }
    }
}

export const todoDoneCheckmark = {
    ...stateSelectionField,
    component: TodoDoneCheckmark,
    extractProps: (fieldInfo, dynamicInfo) => {
        const props = stateSelectionField.extractProps(fieldInfo, dynamicInfo);
        props.viewType = fieldInfo.viewType;
        return props;
    },
}

registry.category("fields").add("todo_done_checkmark", todoDoneCheckmark);
