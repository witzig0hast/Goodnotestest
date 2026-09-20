// Minimal service worker: no offline caching of app data (which is always
// personal and needs to be fresh), it exists only so browsers consider
// this site installable ("Add to Home Screen").
self.addEventListener("fetch", () => {});
