/** Read-only check of what setupIndexes.js created. node scripts/verifyIndexes.js */
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const mdb = mongoose.connection.db;
  console.log(`\n=== normal db "${mongoose.connection.name}" ===`);
  for (const c of (await mdb.listCollections().toArray()).map((c) => c.name).sort()) {
    const idx = await mdb.collection(c).indexes();
    console.log(`  ${c}: ${idx.length} indexes [${idx.map((i) => i.name).join(", ")}]`);
  }

  const { getVectorDb } = require("../src/config/vectorDb");
  const v = getVectorDb();
  await v.asPromise();
  console.log(`\n=== vector db "${v.name}" ===`);
  for (const c of (await v.db.listCollections().toArray()).map((c) => c.name).sort()) {
    const idx = await v.db.collection(c).indexes();
    let search = [];
    try { search = await v.db.collection(c).listSearchIndexes().toArray(); } catch {}
    const s = search.map((i) => `${i.name}:${i.status}${i.queryable ? "/queryable" : ""}`).join(", ");
    console.log(`  ${c}: ${idx.length} btree [${idx.map((i) => i.name).join(", ")}]${s ? "  | search: " + s : ""}`);
  }
  await mongoose.disconnect();
  await v.close();
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
