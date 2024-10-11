(function() {
    window.prout = () => Promise.reject(new Error("prouterror unhandled"))
    window.prouterror = () => { throw new Error("prouterror")}
})()