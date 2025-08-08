const { getTableClient } = require("../tableClient");

module.exports = async function (context, req) {
  try {
    const { partitionKey, rowKey } = req.params || {};
    if (!partitionKey || !rowKey) return context.res = { status: 400, body: { error: "partitionKey and rowKey required" } };
    const client = getTableClient();
    await client.deleteEntity(partitionKey, rowKey);
    context.res = { status: 200, body: { ok: true } };
  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: { error: "failed" } };
  }
}