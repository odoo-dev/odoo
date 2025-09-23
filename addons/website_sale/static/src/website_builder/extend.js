import { BaseOptionComponent } from "@html_builder/core/utils";
import { patch } from "@web/core/utils/patch";

function common() {
    // do stuff
}

class AOption extends BaseOptionComponent {
    setup() {
        super.setup();
        common();
    }
}

class AOptionBis extends AOption {
    static template = "AOptionBisTemplate";
}

class AOptionBis extends BaseOptionComponent {
    static template = "AOptionBisTemplate";
    static excludeOption = [AOption];

    setup() {
        super.setup();
        common();
    }
}

// -----------------------------------------------

class AnotherPlugin extends Plugin {
    resources = {
        builder_options: [AOptionBis],
    };
}

// -----------------------------------------------

class ABisPlugin extends APlugin {
    resources = {...super.resources, builder_options: super.resources.builder_options.filter((x) => x !== AOption).concat([AOptionBis])};
}

class Editor {
    setup() {
        this.resources = this.getResources();
    }
    getResources() {
        // 1. for loop all the plugins to gather resources from plugins
        // 2. post process resources
        this.postProcessResources();
    }
    postProcessResources() {
        for (const plugin of this.plugins) {
            plugin.postProcessResources(this.resources);
        }
    }
}

const ReplaceWebsiteOptionPlugin = replaceOptions(super.resources, [AOption, AOptionBis]);

class ReplaceWebsiteOptionPluginBis extends Plugin {
    resources = {
        builder_options: [AOptionBis],
        remove_builder_options: [AOption],
    };
}



// -----------------------------------------------

// function extendPlugin(Plugin, {Option}) {
//     class PluginBis extends Plugin {
//         resources = {
//             ...super.resources,
//             builder_options: super.resources.builder_options.filter((x) => x !== Option).concat([AOptionBis]),
//             blabla: super.resources.blabla.filter().concat(params.shit),
//         };
//     }
//     return PluginBis;
// }

// extendPlugin(APlugin, {Option: AOptionBis})



// -----------------------------------------------

if (ABisPlugin.constructor instanceof Plugin) {
    filterOut(plugins, ABisPlugin.constructor);
}

// -----------------------------------------------

const map = new Map()
let currentcontext = [];
function whenContext(context, cb){
    if(!map.has(context)){
        map.set(context, new Set())
    }
    map.get(context).add(cb);
}
function withContext(context) {
    currentContext.push(context);
    for (const cb of map.get(context)) {
        cb();
    }
    currentContext.pop();
}
function getContext() {
    return currentcontext.at(-1);
}

function patchWithContext(context, obj, extend) {
    const newExtend = Object.fromEntries(Object.values(extend).map((key, value)=>{
        return [key, function() {
            if (getContext() === context) super();
            else value();
        }];
    }))
    return patch(obj, newExtend)
}

withContext(websiteContext, () => {
    const editor1 = new Editor();
    editor1.start();
    dom.addEventListener("click", () => {
        withContext(websiteContext, function* () {
            yield editor1.fn();
            yield editor1.fn();
        }.bind(this));
    });
    setTimeout(() => {
        withContext(websiteContext, async () => {
            await editor1.fn();
            // marche pas
            await editor1.fn();
        });
    });
});

withContext(massMailingContext, () => {
    const editor2 = new Editor();
    editor2.start();
    setTimeout(() => {
        withContext(massMailingContext, () => {
            editor2.blabla();
        });
    });
});

patchWithContext(websiteContext, AOption, class {
    static template = "AOptionBisTemplate";
    blabla() {

    }
});
patchWithContext(massMailingContext, AOption, class {
    static template = "AOptionBisTemplate";
    blabla() {

    }
});

// function create(Klass) {
//     const context = getContext();
//     const replacedKlass = contextMap.get(context);
//     return new (replacedKlass || Klass)();
// }

// ---


function patch(obj, extend, {context}) {
    obj.template = get () {
        return getContext() === context ? "AOptionBisTemplate" : "AOptionTemplate";
    };
}
