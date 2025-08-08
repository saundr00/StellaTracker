const { getTableClient } = require("../tableClient");

module.exports = async function (context, req) {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30*24*3600*1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const client = getTableClient();
    const months = monthSpan(from, to);
    let items = [];
    for (const m of months) {
      const iter = client.listEntities({ queryOptions: { filter: `PartitionKey eq '${m}'` } });
      for await (const ent of iter) {
        const t = new Date(ent.ts);
        if (t >= from && t <= to) {
          items.push({
            id: ent.rowKey,
            partitionKey: ent.partitionKey,
            metric: ent.metric,
            value: ent.value,
            note: ent.note,
            ts: ent.ts
          });
        }
      }
    }
    items.sort((a,b) => a.ts > b.ts ? 1 : -1);
    context.res = { status: 200, body: { items } };
  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: { error: "failed" } };
  }
}

function monthSpan(from, to) {
  const res = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const endY = to.getUTCFullYear();
  const endM = to.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const mm = (m+1).toString().padStart(2,'0');
    res.push(`${y}-${mm}`);
    m++;
    if (m===12) { m=0; y++; }
  }
  return res;
}