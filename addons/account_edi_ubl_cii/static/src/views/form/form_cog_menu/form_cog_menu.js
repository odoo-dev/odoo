// import { CogMenu } from "../../search/cog_menu/cog_menu";

// export class KanbanCogMenu extends CogMenu {
//     static template = "web.KanbanCogMenu";
//     static props = {
//         ...CogMenu.props,
//         hasSelectedRecords: { type: Number, optional: true },
//     };
//     _registryItems() {
//         return this.props.hasSelectedRecords ? [] : super._registryItems();
//     }
// }


/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from '@web/core/utils/hooks';
import { CogMenu } from "@web/search/cog_menu/cog_menu";

const { onMounted, useState } = owl;

patch(CogMenu.prototype, {
    // setup() {
    //     super.setup();

    //     this.orm = useService('orm');
    //     this.tooltips = useState({});
    //     // Disable the notification service to avoid having a notification for each theme.
    //     this.notificationService = { add: () => () => null };

    //     onMounted(async () => {
    //         const themesWebsites = await this.orm.call('website', 'get_test_themes_websites_theme_preview');
    //         for (const themeId in themesWebsites) {
    //             this.tooltips[themeId] = {
    //                 tooltipTemplate: 'test_themes.ThemeTooltip',
    //                 tooltipPosition: 'left',
    //                 tooltipDelay: 100,
    //                 tooltipInfo: JSON.stringify({url: themesWebsites[themeId]}),
    //             };
    //         }
    //     });
    // },
    template: 'account_edi_ubl_cii.FormCogMenu',
});
