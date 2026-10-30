// Not a client module: the root layout reads these on the server.
export const THEME_STORAGE_KEY = "skillcanon-theme";

/**
 * Runs in <head> before first paint so a saved dark choice never flashes
 * light. Light (paper) is the default; only "dark" is stored/applied.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

