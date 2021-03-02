/** @odoo-module **/
export function supportItem(env) {
  const helpEnterpriseURL = "https://www.odoo.com/help";
  return {
    type: "item",
    description: env._t("Support"),
    href: helpEnterpriseURL,
    callback: () => {
      odoo.browser.open(helpEnterpriseURL, "_blank");
    },
    sequence: 20,
  };
}
