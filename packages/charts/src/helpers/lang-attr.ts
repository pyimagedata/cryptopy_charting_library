import { getCurrentLanguage, onLanguageChange } from './translations';

// CSS text-transform:uppercase follows the element's lang ("i" -> "I" vs "İ"), so UI containers must carry the
// UI language. Elements that were attached and later detached (destroyed widgets) are dropped on the next change.
const tracked = new Map<HTMLElement, boolean>(); // element -> was seen connected
let subscribed = false;

/** Sets `lang` on the element from the current UI language and keeps it in sync on language changes. */
export function bindLangAttr(el: HTMLElement): void {
    el.lang = getCurrentLanguage();
    tracked.set(el, false);
    if (subscribed) return;
    subscribed = true;
    onLanguageChange((lang) => {
        for (const [e, seen] of Array.from(tracked)) {
            if (e.isConnected) { tracked.set(e, true); e.lang = lang; }
            else if (seen) tracked.delete(e);
            else e.lang = lang;
        }
    });
}
