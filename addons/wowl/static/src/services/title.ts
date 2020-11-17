import { Service } from "../types";

interface Parts {
  [key: string]: string | null;
}

interface Title {
  current: string;
  getParts: () => Parts;
  setParts: (parts: Parts) => void;
}

export const titleService: Service<Title> = {
  name: "title",
  deploy(): Title {
    const titleParts: { [key: string]: string } = {};
    function makeTitle(): string {
      return Object.values(titleParts).join(" - ");
    }
    function getParts(): Parts {
      return Object.assign({}, titleParts);
    }
    function setParts(parts: Parts): void {
      for (const key in parts) {
        const val = parts[key];
        if (!val) {
          delete titleParts[key];
        } else {
          titleParts[key] = val;
        }
      }
      document.title = makeTitle();
    }
    return {
      get current() {
        return makeTitle();
      },
      getParts,
      setParts,
    };
  },
};
