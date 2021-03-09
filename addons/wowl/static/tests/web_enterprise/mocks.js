/** @odoo-module **/

// -----------------------------------------------------------------------------
// Mock Services
// -----------------------------------------------------------------------------

export function makeFakeEnterpriseService(params = {}) {
  return {
    name: "enterprise",
    dependencies: [],
    deploy() {
      return {
        warning: 'warning' in params ? params.warning : false,
        expirationDate: 'expirationDate' in params ? params.expirationDate : false,
        expirationReason: 'expirationReason' in params ? params.expirationReason : false,
        moduleList: 'moduleList' in params ? params.moduleList : [],
      };
    },
  };
}
