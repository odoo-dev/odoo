
// class PluginManager {
    
//     constructor(parent, plugins) {

//     }
//     // addPluginSet(name, plugins) {
//     //     // todo
//     // }

//     // removePluginSet(name) {
//     //     // todo
//     // }
// }


// class Plugin {
//     static id = this.name.toLowerCase(); // default name is class name

//     __meta__ = {
//         isDestroyed: false,
//         pluginSet: null,
//     }

//     setup() {}

//     destroy() {}

//     getResource(name, goinUp = true) {
//         // todo
//     }

//     dispatchTo(resourceName, ...args) {
//         for (let handler of this.getResource(name)) {
//             if (typeof handler ===  "function") {
//                 handler(...args);
//             } else {
//                 throw new Error("resource value should be a function")
//             }
//         }
//     }
// }



// class A extends Plugin {
//     static id = "a"; // optional? if no id is set => cannot be imported

//     static shared = ["addThree"];

//     static interfaces = {
//         "a": ["addThree"],
//         "b": ["multiply"],
//     }

//     exports = {
//         addThree: this.addThree.bind(this),
//     }

//     resources = {
//         names: ["owl", "colibri"],
//     };

//     addThree(value) {
//         return this._privateAddThree(value);
//     }

//     /**
//      * private, because there is a _. only a guideline though
//      */
//     _privateAddThree(value) {
//         return value + 3;
//     }

//     showResourceName() {
//         const names = this.resource("names");
//         for (let name of names) {
//             console.log(name);
//         }
//     }
// }

// class C extends A {
//     static replace: ["a"];

// }


// class B extends Plugin { // id = constructor name
//     static dependencies = ["a"];

//     resources = {
//         names: ["owl", "colibri"],
//     };

//     setup() {
//         // literally a
//         const a = this.deps.a;

//         console.log(this.deps.a.addThree(5));

//         // can access private methods
//         console.log(this.deps.a._privateAddThree); 

//     }
// }

// class C extends Plugin {
//     static dependencies = ["a"];
// }

// console.log("coucou")