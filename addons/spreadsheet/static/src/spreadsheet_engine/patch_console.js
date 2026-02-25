console.log = (...args) => {
    Deno.stdout.write(new TextEncoder().encode(args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ") + "\n"));
}
console.error = (...args) => {
    Deno.stdout.write(new TextEncoder().encode(args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ") + "\n"));
}

console.debug = (...args) => {
    Deno.stdout.write(new TextEncoder().encode(args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ") + "\n"));
}
