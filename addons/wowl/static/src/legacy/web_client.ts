import { Query } from "../services/router";
import { OdooEnv, Service } from "../types";

interface State extends Query {
  menu_id?: string;
  title?: string;
}

(window as any).odoo.define("web.web_client", function (require: any) {
  return {};
});

(window as any).odoo.define("wowl.pseudo_web_client", function (require: any) {
  const FakeWebClient = require("web.web_client");

  function makeLegacyWebClientService(legacyEnv: any) {
    const legacyPseudoWebClient: Service<void> = {
      name: "legacy_web_client",
      dependencies: ["title", "router"],
      deploy(env: OdooEnv): void {
        function setTitlePart(part: string, title?: string) {
          env.services.title.setParts({ [part]: title });
        }
        legacyEnv.bus.on("set_title_part", null, (params: { part: string; title?: string }) => {
          const { part, title } = params;
          setTitlePart(part, title);
        });
        Object.assign(FakeWebClient, {
          do_push_state(state: State) {
            if ("title" in state) {
              setTitlePart("action", state.title);
              delete state.title;
            }
            env.services.router.replaceState(state);
          },
          set_title(title?: string) {
            setTitlePart("action", title);
          },
        });
      },
    };
    return legacyPseudoWebClient;
  }

  return makeLegacyWebClientService;
});
