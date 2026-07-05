// Invoke the deployed recompute function with the service-role bearer (mirrors how
// pg_cron will call it). Prints the response. Reads secrets from .env.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, "../.env"), "utf8");
const get = (k) => {
  const m = new RegExp(`^${k}=(.*)$`, "m").exec(raw);
  return m ? m[1].trim() : undefined;
};

const url = `${get("SUPABASE_URL")}/functions/v1/recompute`;
const key = get("SUPABASE_SERVICE_ROLE_KEY");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: "{}",
});
console.log("STATUS", res.status);
console.log(await res.text());
