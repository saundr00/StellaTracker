const { TableClient } = require("@azure/data-tables");

function getTableClient() {
  const conn = process.env.TABLES_CONNECTION_STRING;
  const tableName = process.env.TABLE_NAME || "events";
  if (!conn) throw new Error("Missing TABLES_CONNECTION_STRING");
  const client = TableClient.fromConnectionString(conn, tableName);
  return client;
}

module.exports = { getTableClient };
