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
    const regex = /(\/web\/assets\/[^"]+)(?=")/gm;

    const page = await fetch(url)
        .then( r => r.text() )
        .then( t => {return(t);});

    const matches = page.match(regex); // get all bundles declared in 'page'
    let bundles = [];
    matches.forEach((match) => {
        let parts = match.match(/[^\/]+(?=\.min)/gm);
        bundles.push({path : match, name : parts[parts.length - 1]});
    });
    return bundles;
}

function getStats(bundle) {
    const regex = /\/\* \/([\s\S]*?)\*\//;
    let parts = bundle.split(regex);
    parts.splice(0,1);
    let parts_info = [];
    for (let i = 0; i < parts.length; i+=2){
        let data = parts[i + 1];
        parts_info.push({
            'file': parts[i],
            'data': data,
            'length': byteSizeConvert(data),
        });
    }
    return parts_info.sort(function(a, b){return a.length - b.length;}).reverse();
}

function getModuleStats(bundle) {
    const stats = getStats(bundle);
    const module_info = {};
    for(const stat in stats) {
        const module = stats[stat]['file'].split('/');
        if (module_info[module[0]]) {
            module_info[module[0]]+=Number(stats[stat]['length']);
        } else {
            module_info[module[0]] = Number(stats[stat]['length']);
        }
    }

    const info = [];
    for(const [key, value] of Object.entries(module_info)) {
        info.push({'name':key, 'length':value, 'size':readableFileSize(value) });
    }

    return info.sort(function(a, b){return a.length - b.length;}).reverse();
}

const byteSizeConvert = str => new Blob([str]).size;

function readableFileSize(attachmentSize) {
    const fileSize = attachmentSize ?? 0;
    if (!fileSize) {
      return `0 kb`;
    }
    const sizeInKb = fileSize / 1024;
    if (sizeInKb > 1024) {
      return `${(sizeInKb / 1024).toFixed(2)} mb`;
    } else {
      return `${sizeInKb.toFixed(2)} kb`;
    }
  }

export function viewAssetsSize({ env }) {
    return {
        type: "item",
        description: _t("View Assets Size"),
        callback: async() => {
            const bundles= await getUsedBundles();
            let output="";
            for (let bundle in bundles){
                const url = location.origin + bundles[bundle].path;
                const bundle_content = await fetch(url)
                    .then( r => r.text() )
                    .then( t => {return(t);});
                const isCssFile = url.endsWith("css");
                // Asset's module wise stats
                const moduleStats = getModuleStats(bundle_content);
                output+="Assets in " + bundles[bundle].name + "(" + (isCssFile?'CSS':'JS') + ")" + " :" + readableFileSize(byteSizeConvert(bundle_content)) + " Bytes\n";
                for (let stat in moduleStats ) {
                    const percentage = (Number(moduleStats[stat].length)/Number(bundle_content.length))*100;
                    output += moduleStats[stat].name + " : "  + percentage.toFixed(2) + "% (" + moduleStats[stat].size + ")\n";
                }
                output+='\n';
            }

            env.services.dialog.add(ViewAssetsDialog, { output } );
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
