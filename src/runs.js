import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getHomeDir } from "./config.js";

function runsDir(env = process.env) {
  return path.join(getHomeDir(env), "runs");
}

export async function saveRun(run, env = process.env) {
  const directory = runsDir(env);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${run.id}.json`);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, target);
  return target;
}

export async function listRuns(env = process.env, limit = 30) {
  let files;
  try {
    files = await readdir(runsDir(env));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const selected = files
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);
  const runs = [];
  for (const name of selected) {
    try {
      const run = JSON.parse(await readFile(path.join(runsDir(env), name), "utf8"));
      runs.push({
        id: run.id,
        createdAt: run.createdAt,
        query: run.query,
        platform: run.platform,
        itemCount: countItems(run.result),
      });
    } catch {
      // Ignore a partial or manually edited history entry.
    }
  }
  return runs;
}

export async function readRun(id, env = process.env) {
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(runsDir(env), `${id}.json`), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function countItems(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  for (const key of ["results", "items", "videos", "posts", "data"]) {
    if (Array.isArray(value[key])) return value[key].length;
  }
  return 0;
}
