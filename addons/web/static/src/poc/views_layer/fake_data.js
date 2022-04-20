/** @odoo-module **/

export const FIELDS = {
    active: {
        name: "active",
        readonly: false,
        required: false,
        string: "Active",
        type: "boolean",
    },
    active_render_mode: {
        name: "active_render_mode",
        options: [
            ["checkbox", "Checkbox"],
            ["switch", "Switch"],
        ],
        readonly: false,
        required: false,
        string: "Active render mode",
        type: "selection",
    },
    id: {
        name: "id",
        readonly: true,
        required: false,
        string: "ID",
        type: "integer",
    },
    name: {
        name: "name",
        readonly: false,
        required: false,
        string: "Name",
        type: "char",
    },
};

export const ARCH = /*xml*/ `
    <form>
        <field name="id" invisible="[['active', '=', False]]" />
        <field name="name" placeholder="Name" />
        <field name="active" widget="boolean" invisible="['!', ['active_render_mode', '=', 'checkbox']]" />
        <field name="active" widget="boolean_toggle" invisible="['!', ['active_render_mode', '=', 'switch']]" />
        <field name="active_render_mode" string="Render mode" />
    </form>
`;

const RECORDS = {
    1: {
        id: 1,
        name: "Record 1",
        active: false,
        active_render_mode: "checkbox",
    },
    2: {
        id: 2,
        name: "Record 2",
        active: true,
        active_render_mode: "switch",
    },
};

export function read(ids) {
    return Promise.resolve(ids.map((id) => ({ ...RECORDS[id] })));
}

// const schema = useSchema({
//     fields: {
//         id: {
//             type: "integer",
//             readonly: true,
//         },
//         name: {
//             type: "char",
//             required: true,
//         },
//         active_checkbox: {
//             name: "active",
//             type: "boolean",
//             invisible: [["active_render_mode", "!=", "checkbox"]],
//         },
//         active_switch: {
//             name: "active",
//             type: "boolean_toggle",
//             invisible: [["active_render_mode", "!=", "switch"]],
//         },
//         active_render_mode: {
//             type: "selection",
//             options: [
//                 ["checkbox", "Checkbox"],
//                 ["switch", "Switch"],
//             ],
//         },
//     },
//     data: {
//         id: 2,
//         name: "Record",
//         active: true,
//         active_render_mode: "checkbox",
//     },
// });

// ...

// const template = `
//     <Field t-props="schema.id.computeProps()" />
//     <Field t-props="schema.name.computeProps()" />
//     <Field t-props="schema.active_render_mode.computeProps()" />
//     <t t-if="!schema.active_checkbox.isInvisible">
//         <Field t-props="schema.active_checkbox.computeProps()" />
//     </t>
//     <t t-if="!schema.active_switch.isInvisible">
//         <Field t-props="schema.active_switch.computeProps()" />
//     </t>
// `;
