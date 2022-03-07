/** @odoo-module **/

import { useService } from '@web/core/utils/hooks';
import { WebsiteDialog } from './dialog';

const { Component, useState, useEffect, onWillStart } = owl;

export class MenuDialog extends WebsiteDialog {
    setup() {
        super.setup();

        this.title = this.env._t("Add a menu item");

        this.state = useState({
            name: this.props.name,
            url: this.props.url,
        });
    }

    primaryClick() {
        this.props.save(this.state.name, this.state.url);
        this.close();
    }
}
MenuDialog.bodyTemplate = 'website.MenuDialog';
MenuDialog.props = {
    ...WebsiteDialog.props,
    name: { type: String, optional: true },
    url: { type: String, optional: true },
    isMegaMenu: { type: Boolean, optional: true },
    save: Function,
};
MenuDialog.defaultProps = {
    name: '',
    url: '/',
};

class MenuRow extends Component {
    edit() {
        this.props.edit(this.props.menu.fields['id']);
    }

    delete() {
        this.props.delete(this.props.menu.fields['id']);
    }
}
MenuRow.props = {
    menu: Object,
    edit: Function,
    delete: Function,
};
MenuRow.template = 'website.MenuRow';
MenuRow.components = {
    MenuRow,
};

export class EditMenuDialog extends WebsiteDialog {
    setup() {
        super.setup();
        this.orm = useService('orm');
        this.website = useService('website');
        this.dialogs = useService('dialog');

        this.title = this.env._t("Edit Menu");
        this.primaryTitle = this.env._t("Save");

        this.state = useState({ rootMenu: {} });

        onWillStart(async () => {
            const menu = await this.orm.call('website.menu', 'get_tree', [this.website.currentWebsite.id]);
            this.state.rootMenu = menu;
            this.map = new Map();
            this.populate(this.map, this.state.rootMenu);
            this.toDelete = [];
        });

        useEffect(() => {
            this.$sortables = $(this.el).find('.oe_menu_editor');
            this.$sortables.nestedSortable({
                listType: 'ul',
                handle: 'div',
                items: 'li',
                maxLevels: 2,
                toleranceElement: '> div',
                forcePlaceholderSize: true,
                opacity: 0.6,
                placeholder: 'oe_menu_placeholder',
                tolerance: 'pointer',
                attribute: 'data-menu-id',
                expression: '()(.+)', // nestedSortable takes the second match of an expression (*sigh*)
                isAllowed: (placeholder, placeholderParent, currentItem) => {
                    return !placeholderParent
                        || !currentItem[0].dataset.isMegaMenu && !placeholderParent[0].dataset.isMegaMenu;
                },
            });
        });
    }

    populate(map, menu) {
        map.set(menu.fields['id'], menu);
        for (const submenu of menu.children) {
            this.populate(map, submenu);
        }
    }

    addMenu(isMegaMenu) {
        this.dialogs.add(MenuDialog, {
            isMegaMenu,
            save: (name, url, isNewWindow) => {
                const newMenu = {
                    fields: {
                        id: `menu_${(new Date).toISOString()}`,
                        name,
                        url: isMegaMenu ? '#' : url,
                        new_window: isNewWindow,
                        'is_mega_menu': isMegaMenu,
                        sequence: 0,
                        'parent_id': false,
                    },
                    'children': [],
                    'is_homepage': false,
                };
                this.map.set(newMenu.fields['id'], newMenu);
                this.state.rootMenu.children.push(newMenu);
            },
        });
    }

    editMenu(id) {
        const menuToEdit = this.map.get(id);
        this.dialogs.add(MenuDialog, {
            name: menuToEdit.fields['name'],
            url: menuToEdit.fields['url'],
            isMegaMenu: menuToEdit.fields['is_mega_menu'],
            save: (name, url) => {
                menuToEdit.fields['name'] = name;
                menuToEdit.fields['url'] = url;
                // Forces a rerender
                this.state.rootMenu.children = [...this.state.rootMenu.children];
            },
        });
    }

    deleteMenu(id) {
        const menuToDelete = this.map.get(id);
        const parentId = menuToDelete.fields['parent_id'] || this.state.rootMenu.fields['id'];
        const parent = this.map.get(parentId);
        parent.children = parent.children.filter(menu => menu.fields['id'] !== id);
        this.map.delete(id);
        this.toDelete.push(id);
    }

    async primaryClick() {
        const newMenus = this.$sortables.nestedSortable('toArray', {startDepthCount: 0});
        const levels = [];
        const data = [];

        // Resequence, re-tree and remove useless data
        for (const menu of newMenus) {
            if (menu.id) {
                levels[menu.depth] = (levels[menu.depth] || 0) + 1;
                const {fields: menuFields} = this.map.get(menu.id) || this.map.get(parseInt(menu.id, 10));
                menuFields['sequence'] = levels[menu.depth];
                menuFields['parent_id'] = menu['parent_id'] || this.state.rootMenu.fields['id'];
                data.push(menuFields);
            }
        }

        await this.orm.call('website.menu', 'save', [
            this.website.currentWebsite.id,
            {
                'data': data,
                'to_delete': this.toDelete,
            }
        ]);
        this.close();
        this.website.goToWebsite();
    }
}
EditMenuDialog.bodyTemplate = 'website.EditMenuDialog';
EditMenuDialog.components = {
    MenuRow,
};
