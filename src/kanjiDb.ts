import path from "node:path";
import Database from "better-sqlite3";

const dbFile = path.resolve(process.cwd(), "data", "kanjis.db");

export const kanjiDb = new Database(dbFile, { readonly: true, fileMustExist: true });
