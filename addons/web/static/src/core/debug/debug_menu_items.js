import { _t } from "@web/core/l10n/translation";
import { browser } from "@web/core/browser/browser";
import { router } from "@web/core/browser/router";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { Component, xml } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";


// Dialog Declaration
// it's used to display all the assets used in a page and their size
class ViewAssetsDialog extends Component {
    static template = xml`
        <Dialog title="this.constructor.title">
            <p> Found files : </p>
            <pre t-esc="props.output"/>
        </Dialog>`;
    static components = { Dialog };
    static props = {
        output: { type: String },
        close: { type: Function },
    };
    static title = "Assets size";
}

async function getUsedBundles() {
    const url = "./";
    const regex = /\/web\/assets\/[^"]+(?=")/gm;

    const page = await fetch(url).then((r) => r.text());
    const matches = page.match(regex);

    return matches.map((match) => {
        const name = match.split('/').pop().split('.min')[0];
        return { path: match, name };
    });
}

function getStats(bundle) {
    const regex = /\/\* \/([\s\S]*?)\*\//;
    return bundle.split(regex)
        .slice(1)
        .reduce((acc, _, i, arr) => {
            if (i % 2 === 0) {
                const file = arr[i];
                const data = arr[i + 1];
                acc.push({
                    file,
                    data,
                    length: byteSizeConvert(data),
                });
            }
            return acc;
        }, [])
        .sort((a, b) => b.length - a.length);
}

const combinedInfo = {};
// Combine the bundle state of JS and CSS.
function getModuleStats(bundleContent, bundleName) {
    const stats = getStats(bundleContent);
    const moduleInfo = stats.reduce((acc, stat) => {
        const module = stat.file.split('/')[0];
        acc[module] = (acc[module] || 0) + stat.length;
        return acc;
    }, {});

    combinedInfo[bundleName] = combinedInfo[bundleName] || { data: {}, length: 0 };

    let totalSize = 0;
    const info = Object.entries(moduleInfo).map(([name, length]) => {
        const size = readableFileSize(length);
        combinedInfo[bundleName].data[name] = {
            name,
            length: (combinedInfo[bundleName].data[name]?.length || 0) + length,
            size: readableFileSize((combinedInfo[bundleName].data[name]?.length || 0) + length),
        };
        totalSize += combinedInfo[bundleName].data[name].length;
        return { name, length, size };
    });

    combinedInfo[bundleName].length = totalSize;

    return info.sort((a, b) => b.length - a.length);
}

const byteSizeConvert = (str) => new Blob([str]).size;

function readableFileSize(fileSize = 0) {
    const sizeInKb = fileSize / 1024;
    return sizeInKb > 1024
        ? `${(sizeInKb / 1024).toFixed(2)} mb`
        : `${sizeInKb.toFixed(2)} kb`;
}

export function viewAssetsSize({ env }) {
    return {
        type: "item",
        description: _t("View Assets Size"),
        callback: async () => {
            const bundles = await getUsedBundles();
            let output = "";

            for (const { path, name } of bundles) {
                const url = `${location.origin}${path}`;
                const bundleContent = await fetch(url).then((r) => r.text());
                getModuleStats(bundleContent, name);
            }

            output += "====================== Assets stats ( > 5% )=====================\n";
            for (const [bundle, { data, length }] of Object.entries(combinedInfo)) {
                output += `Assets in ${bundle} : ${readableFileSize(length)}\n\n`;
                const info = Object.values(data).sort((a, b) => b.length - a.length);
                for (const { name, length, size } of Object.values(info)) {
                    const percentage = (length / combinedInfo[bundle].length) * 100;
                    if ( percentage >= 5) {
                        output += `${name} : ${percentage.toFixed(2)}% (${size})\n`;
                    }
                }

                output += '\n';
            }

            env.services.dialog.add(ViewAssetsDialog, { output });
        },
        sequence: 450,
    };
}

function activateTestsAssetsDebugging({ env }) {
    if (String(router.current.debug).includes("tests")) {
        return;
    }

    return {
        type: "item",
        description: _t("Activate Test Mode"),
        callback: () => {
            router.pushState({ debug: "assets,tests" }, { reload: true });
        },
        sequence: 580,
        section: "tools",
    };
}

export function regenerateAssets({ env }) {
    return {
        type: "item",
        description: _t("Regenerate Assets"),
        callback: async () => {
            await env.services.orm.call("ir.attachment", "regenerate_assets_bundles");
            browser.location.reload();
        },
        sequence: 550,
        section: "tools",
    };
}

export function becomeSuperuser({ env }) {
    const becomeSuperuserURL = browser.location.origin + "/web/become";
    if (!user.isAdmin) {
        return false;
    }
    return {
        type: "item",
        description: _t("Become Superuser"),
        href: becomeSuperuserURL,
        callback: () => {
            browser.open(becomeSuperuserURL, "_self");
        },
        sequence: 460,
    };
}

function leaveDebugMode() {
    return {
        type: "item",
        description: _t("Leave Debug Mode"),
        callback: () => {
            router.pushState({ debug: 0 }, { reload: true });
        },
        sequence: 650,
    };
}

registry
    .category("debug")
    .category("default")
    .add("regenerateAssets", regenerateAssets)
    .add("becomeSuperuser", becomeSuperuser)
    .add("leaveDebugMode", leaveDebugMode)
    .add("activateTestsAssetsDebugging", activateTestsAssetsDebugging)
    .add("viewAssetSize", viewAssetsSize);
