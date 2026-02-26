import { outputToStdOut } from "./rpc/std_streams";

console.log = (...args) => {
    outputToStdOut(args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ") + "\n");
}
console.error = (...args) => {
    outputToStdOut(args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ") + "\n");
}

console.debug = (...args) => {
    outputToStdOut(args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ") + "\n");
}
