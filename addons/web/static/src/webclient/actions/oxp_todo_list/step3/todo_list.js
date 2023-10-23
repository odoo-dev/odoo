/** @odoo-module **/

import { registry } from "@web/core/registry";

import { Component, useState } from "@odoo/owl";
import { TodoItem } from "./todo_item";
import { TodoListModel } from "./todo_model";

export class TodoList extends Component {
    static template = "step3.TodoList";
    static components = { TodoItem };

    setup() {
        this.todoListModel = useState(
            new TodoListModel([
                {
                    message: "Send email to John",
                    isDone: false,
                },
            ])
        );
    }

    onInputChange(ev) {
        this.state.todoListModel.add({
            message: ev.target.value,
        });
        ev.target.value = "";
    }
}

registry.category("actions").add("todo_list_step3", TodoList);
