const mongoose = require("mongoose");

let _vectorConn = null;

function getVectorDb() {
  if (_vectorConn) return _vectorConn;

  const uri = process.env.VECTOR_DB_URI;
  if (!uri) throw new Error("VECTOR_DB_URI is not set in .env");

  _vectorConn = mongoose.createConnection(uri);
  _vectorConn.on("connected", () => console.log("[VectorDB] Connected to testvector"));
  _vectorConn.on("error", (err) => console.error("[VectorDB] Connection error:", err.message));
  _vectorConn.on("disconnected", () => console.warn("[VectorDB] Disconnected"));

  return _vectorConn;
}

module.exports = { getVectorDb };
