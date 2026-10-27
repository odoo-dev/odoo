import { browser } from "@web/core/browser/browser";
import { MultiTabFallbackPlugin } from "./multi_tab_fallback_plugin";
import { MultiTabSharedWorkerPlugin } from "./multi_tab_shared_worker_plugin";
import { services } from "@web/core/services";

const Base = browser.SharedWorker ? MultiTabSharedWorkerPlugin : MultiTabFallbackPlugin;

export class MultiTabPlugin extends Base {}

services.add(MultiTabPlugin);
