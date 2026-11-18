import {copyFile} from "node:fs/promises";
await copyFile(new URL("../src/requirements.js",import.meta.url),new URL("../sayso-install/src/requirements.js",import.meta.url));
