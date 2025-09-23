import fs from "fs";

const STORE_FILE = "./posted_matches.json";

export function loadPostedMatches() {
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify([]));
    return new Set();
  }
  try {
    const data = fs.readFileSync(STORE_FILE, "utf-8");
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

export function savePostedMatches(matchIds) {
  fs.writeFileSync(STORE_FILE, JSON.stringify([...matchIds], null, 2));
}
