const { getTableClient } = require("../tableClient");
const { v4: uuidv4 } = require("uuid");

module.exports = async function (context, req) {
  try {
    const { metric, value, note, ts } = req.body || {};
    if (!metric) return context.res = { status: 400, body: { error: "metric required" } };
    const timestamp = ts ? new Date(ts).toISOString() : new Date().toISOString();

    const client = getTableClient();
    const month = timestamp.slice(0,7);
    const rowKey = uuidv4();
    const entity = {
      partitionKey: month,
      rowKey,
      metric: metric,
      value: value || "",
      note: note || "",
      ts: timestamp
    };
    await client.createEntity(entity);
    context.res = { status: 200, body: { ok: true, id: rowKey, partitionKey: month } };
  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: { error: "failed" } };
  }
}