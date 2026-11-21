import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
export class DB {
  raw = new DatabaseSync(":memory:");
  constructor() { for (const file of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort()) this.raw.exec(readFileSync("drizzle/"+file,"utf8")); }
  prepare(sql: string) {
    let values: unknown[] = [];
    const execute = () => {
      const query = this.raw.prepare(sql);
      if (query.columns().length) return { success: true, results: query.all(...values as []), meta: { changes: Number(this.raw.prepare("SELECT changes() AS n").get()!.n) } };
      return { success: true, results: [], meta: { changes: Number(query.run(...values as []).changes) } };
    };
    const stmt = { bind: (...args: unknown[]) => { values = args; return stmt; },
      first: async <T>() => execute().results[0] as T ?? null,
      all: async <T>() => execute() as unknown as D1Result<T>, run: async () => execute(), execute };
    return stmt;
  }
  async batch(statements: ReturnType<DB["prepare"]>[]) {
    this.raw.exec("BEGIN IMMEDIATE");
    try { const result = statements.map(s=>s.execute()); this.raw.exec("COMMIT"); return result; }
    catch (error) { this.raw.exec("ROLLBACK"); throw error; }
  }
}
export class Bucket {
  values = new Map<string, Uint8Array>(); sizes: number[] = []; fail = false;
  async put(key: string, data: Uint8Array) { this.values.set(key,data); }
  async delete(keys: string | string[]) { if(this.fail)throw Error("synthetic failure"); for(const key of typeof keys==="string"?[keys]:keys)this.values.delete(key); }
  async list({prefix,limit,cursor}:{prefix:string;limit:number;cursor?:string}) {
    const keys=[...this.values.keys()].filter(k=>k.startsWith(prefix)&&(!cursor||k>cursor)).sort(), selected=keys.slice(0,limit);
    this.sizes.push(selected.length);return {objects:selected.map(key=>({key})),truncated:keys.length>limit,cursor:selected.at(-1)};
  }
}
