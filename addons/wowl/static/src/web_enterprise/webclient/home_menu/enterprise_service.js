/** @odoo-module **/

export const enterpriseService = {
  name: "enterprise",
  dependencies: [],
  deploy() {
    const { session_info } = odoo;

    return {
      expirationDate: session_info.expiration_date,
      expirationReason: session_info.expiration_reason,
      moduleList: session_info.module_list || [],
      warning: session_info.warning,
    };
  },
};
