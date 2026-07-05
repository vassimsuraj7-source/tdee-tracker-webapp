import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the repo-root .env so integration tests can reach the live Supabase project.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });
