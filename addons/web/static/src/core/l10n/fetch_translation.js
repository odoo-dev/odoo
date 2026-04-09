import { browser } from "../browser/browser";
import { objectToUrlEncodedString } from "../utils/urls";

export async function fetchTranslations(translationURL, lang, hash) {
    let queryString = objectToUrlEncodedString({ hash, lang });
    queryString = queryString.length > 0 ? `?${queryString}` : queryString;
    console.log(translationURL);
    const response = await browser.fetch(`${translationURL}${queryString}`, {
        cache: "no-store",
    });
    if (!response.ok) {
        throw new Error("Error while fetching translations");
    }
    return response.json();
}
