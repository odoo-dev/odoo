// /** @odoo-module **/

// AAB: re-enable this when it is moved in web_studio
// import { HomeMenu } from '@wowl/web_enterprise/webclient/home_menu/home_menu';
// import { urlBuilder } from '@wowl/utils/misc';

// const __setup = HomeMenu.prototype.setup;
// HomeMenu.prototype.setup = function () {
//   __setup.call(this);
//   // LPE FIXME: uncommment when studio is installed
//   // if (!this.menus.getMenu('root').background_image) {
//   //   return;
//   // }
//   const { url } = urlBuilder();
//   this.backgroundImageUrl = url('/web/image', {
//     id: this.env.services.user.current_company.id,
//     model: 'res.company',
//     field: 'logo', // LPE FIXME; should be background_image
//   });
// };
