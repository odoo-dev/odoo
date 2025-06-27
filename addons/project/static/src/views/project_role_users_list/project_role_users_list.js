import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Field } from "@web/views/fields/field";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import {
    Many2ManyTagsAvatarUserField,
} from "@mail/views/web/fields/many2many_avatar_user_field/many2many_avatar_user_field";
export class ProjectRoleUsersList extends Component {
    static template = "ProjectRoleUsersList";
    static props = {
        ...standardFieldProps,
    };
    static components = {
        Many2ManyTagsAvatarUserField,
        Field,
    };
    setup() {
        this.state = useState({
            allRoleItems: this.props.record.data.role_to_users_ids.records,
        });
    }
}

registry.category("fields").add("project_role_users_list", {
    component: ProjectRoleUsersList,
});
