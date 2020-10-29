// import { Component, tags } from "@odoo/owl";
// import { actionRegistry } from "./registries";
// import { OdooEnv } from "./types";
// import { useService } from "./core/hooks";

// // Demo code
// class HelloAction extends Component<{}, OdooEnv> {
//   static template = tags.xml`<div>
//       Discuss ClientAction
//       <button t-on-click="_pushState">Push Stuff in URL</button>
//     </div>`;
//   router = useService("router");
//   _pushState() {
//     this.router.pushState({ stuff: "inurl" });
//   }
// }
// actionRegistry.add("mail.widgets.discuss", HelloAction);
// // actionRegistry.add("mail.widgets.discuss", () => console.log("I'm a function client action"));
