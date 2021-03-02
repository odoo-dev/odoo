/** @odoo-module alias=wowl.WebClientConfigure **/
// keep this alias, it is needed to override the configuration for booting the webclient
import { WebClient } from "./webclient";
// LPE FIXME: this is only because the module is aliased
export default function configure(odooConfig) {
  return WebClient;
}
