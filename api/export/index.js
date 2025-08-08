const { getTableClient } = require("../tableClient");

module.exports = async function (context, req) {
  try {
    const days = parseInt(req.query.days || "30", 10);
    const to = new Date();
    const from = new Date(to.getTime() - days*24*3600*1000);
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
            metric: ent.metric || "",
            value: ent.value || "",
            note: (ent.note || "").replace(/\n/g, " "),
            ts: ent.ts
          });
        }
      }
    }
    items.sort((a,b) => a.ts > b.ts ? 1 : -1);
    const header = "id,partitionKey,ts,metric,value,note\n";
    const rows = items.map(i => csvRow([i.id, i.partitionKey, i.ts, i.metric, i.value, i.note]));
    const csv = header + rows.join("\n");
    context.res = {
      status: 200,
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=stella_export.csv" },
      body: csv
    };
  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: { error: "failed" } };
  }
}

function csvRow(arr) {
  return arr.map(cell => {
    const s = String(cell ?? "");
    if (/[",\n]/.test(s)) {
      return \"\" + s.replaceAll("\"", "\\"") + \"\";
    }
    return s;
  }).join(",");
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