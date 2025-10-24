import { registry } from "@web/core/registry";
import { upgradeFrom } from "./upgrade_helpers";
import { getCurrentLocalStorageVersion, LocalStorageEntry } from "@mail/utils/common/local_storage";
import { parseVersion } from "@mail/utils/common/misc";

export const discussUpgradeService = {
    dependencies: [],
    start() {
        const lse = new LocalStorageEntry("discuss.upgrade.version");
        const parsed = lse.parse();
        const oldVersion = parsed?.version ?? "1.0";
        const currentVersion = getCurrentLocalStorageVersion();
        lse.set(true, currentVersion);
        if (parseVersion(oldVersion).isLowerThan(currentVersion)) {
            upgradeFrom(oldVersion);
        }
    },
};

registry.category("services").add("discuss.upgrade", discussUpgradeService);
