import fs from "node:fs/promises";
import { database } from "./db.mjs";
export function statements(source) {
  const out = [];
  let current = "",
    single = false,
    dollar = false,
    line = false;
  for (let i = 0; i < source.length; i++) {
    let c = source[i],
      next = source[i + 1];
    if (line) {
      if (c === "\n") line = false;
      current += c;
      continue;
    }
    if (!single && !dollar && c === "-" && next === "-") {
      line = true;
      current += c;
      continue;
    }
    if (!single && c === "$" && next === "$") {
      dollar = !dollar;
      current += "$$";
      i++;
      continue;
    }
    if (!dollar && c === "'") {
      if (single && next === "'") {
        current += "''";
        i++;
        continue;
      }
      single = !single;
    }
    if (c === ";" && !single && !dollar) {
      if (current.trim()) out.push(current);
      current = "";
    } else current += c;
  }
  if (current.trim()) out.push(current);
  return out;
}
export async function migrate(sql) {
  for (const f of ["001_sales_agent.sql", "002_complete_agent.sql"]) {
    const source = await fs.readFile(
      new URL("./migrations/" + f, import.meta.url),
      "utf8",
    );
    await sql.transaction(statements(source).map((s) => sql(s)));
  }
}
if (process.argv[1]?.endsWith("/migrate.mjs")) {
  await migrate(database());
  console.log("Daniel migrations applied to dedicated database");
}
