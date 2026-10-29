/**
 * The cast of Scale-Up!, defined once and reused by every level:
 * the 3D characters (three/kit/characters.js) and the 2D dialogue
 * portraits (components/portrait.xml) read the same definition.
 *
 * Keys are the ones the server sends in `chat[].who` and `cast`.
 */
export const PEOPLE = {
    ceo: {
        name: "You", role: "CEO",
        skin: "#e9b88c", hair: "#241a14", hairStyle: "short",
        jacket: "#33415c", shirt: "#ffffff", tie: "#8e3b5f", trousers: "#2a3550", shoes: "#1d1d20",
    },
    marc: {
        name: "Marc", role: "Purchase Manager",
        skin: "#e2ab7f", hair: "#4a3526", hairStyle: "short", beard: true, glasses: true,
        jacket: "#4a6fa5", shirt: "#f2f5f8", tie: "#2b3a4a", trousers: "#38465c", shoes: "#2a2320",
    },
    sophia: {
        name: "Sophia", role: "Sales Manager",
        skin: "#c88c5e", hair: "#1d1512", hairStyle: "long",
        jacket: "#b8415f", shirt: "#ffffff", tie: null, trousers: "#3a2b3a", shoes: "#2a2024",
    },
    paul: {
        name: "Paul", role: "Secretary",
        skin: "#efc49c", hair: "#8a6a3c", hairStyle: "short",
        jacket: "#6a994e", shirt: "#ffffff", tie: "#36503a", trousers: "#3f4a3c", shoes: "#2a2320",
    },
    anita: {
        name: "Anita", role: "Accountant",
        skin: "#d8a26e", hair: "#231712", hairStyle: "bun", glasses: true,
        jacket: "#714b67", shirt: "#f7f2f5", tie: null, trousers: "#3b2f3a", shoes: "#241f24",
    },
    brandon: {
        name: "Brandon", role: "Customer · Azure Interior",
        skin: "#f0c49a", hair: "#2a1d14", hairStyle: "short",
        jacket: "#e8742c", shirt: "#ffffff", tie: null, trousers: "#404a57", shoes: "#2f2a26",
    },
    roger: {
        name: "Roger", role: "Inventory Manager",
        skin: "#c98f63", hair: "#55504a", hairStyle: "cap", beard: true,
        jacket: "#2f5d8a", shirt: "#dfe6ec", tie: null, trousers: "#39434f", shoes: "#232323",
        hiVis: true,
    },
    driver: {
        name: "Driver", role: "Wood Corner",
        skin: "#d9a06a", hair: "#6b5a3c", hairStyle: "cap",
        jacket: "#1f7a4d", shirt: "#e8efe9", tie: null, trousers: "#33403a", shoes: "#241f1c",
        hiVis: true,
    },
    worker: {
        name: "Warehouse", role: "Operator",
        skin: "#b97f53", hair: "#2f2a26", hairStyle: "cap",
        jacket: "#44505e", shirt: "#dfe6ec", tie: null, trousers: "#39434f", shoes: "#232323",
        hiVis: true,
    },
    phone: { name: "Incoming call", role: "", icon: "📞" },
    mail: { name: "Inbox", role: "", icon: "✉️" },
    doc: { name: "On your desk", role: "", icon: "📄" },
};

/** Look of a character, with safe fallbacks for an unknown key. */
export function personLook(key) {
    return PEOPLE[key] || { name: key, role: "", skin: "#e0b088", hair: "#2b2b2b", hairStyle: "short", jacket: "#5a6b7d", shirt: "#ffffff", trousers: "#3a4450", shoes: "#222" };
}
