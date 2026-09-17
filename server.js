// ============================================================================
//  WiFi Control Pro — Agent MikroTik
//  CARA PAKAI:
//    1. Isi 3 baris di bawah (IP, user, password MikroTik kamu)
//    2. Buka terminal di folder ini
//    3. Jalankan:  node server.js
// ============================================================================

const MIKROTIK_HOST = "157.20.144.157:1525";       // <<< GANTI: IP MikroTik (biasanya 192.168.88.1)
const MIKROTIK_USER = "admin";              // <<< GANTI: username MikroTik
const MIKROTIK_PASS = "pesarean23";      // <<< GANTI: password MikroTik

// ============================================================================
//  Jangan ubah di bawah ini
// ============================================================================
import express from "express";
import cors from "cors";
import { RouterOSAPI } from "node-routeros";

const app = express();
app.use(cors());

let cache = { at: 0, data: null };

async function fetchMikrotik() {
  const conn = new RouterOSAPI({
    host: MIKROTIK_HOST,
    user: MIKROTIK_USER,
    password: MIKROTIK_PASS,
    timeout: 8,
    tls: { rejectUnauthorized: false },
  });

  await conn.connect();
  const [res, iface, pppoe, arp, lease] = await Promise.all([
    conn.write("/system/resource/print"),
    conn.write("/interface/print"),
    conn.write("/ppp/active/print"),
    conn.write("/ip/arp/print"),
    conn.write("/ip/dhcp-server/lease/print"),
  ]);
  conn.close();

  const r = res[0] || {};
  const wan =
    iface.find((i) => i.name === "ether1" || i.name.startsWith("pppoe")) ||
    iface[0] ||
    {};
  const mb = (b) => (Number(b || 0) * 8 / 1e6).toFixed(2);

  return {
    cpu: Number(r["cpu-load"] || 0),
    uptime: r.uptime || "-",
    version: r.version || "-",
    board: r["board-name"] || "-",
    freeMemory: Number(r["free-memory"] || 0),
    totalMemory: Number(r["total-memory"] || 0),
    rxMbps: mb(wan["rx-byte"]),
    txMbps: mb(wan["tx-byte"]),
    pppoeAktif: pppoe.length,
    pppoe: pppoe.map((p) => ({
      user: p.name,
      ip: p.address,
      uptime: p.uptime,
    })),
    devices: arp.map((a) => {
      const l = lease.find((x) => x["mac-address"] === a["mac-address"]);
      return {
        name: l?.["host-name"] || a["mac-address"],
        ip: a.address,
        mac: a["mac-address"],
        status: "online",
      };
    }),
    interfaces: iface.map((i) => ({
      name: i.name,
      running: i.running === "true",
      rx: mb(i["rx-byte"]),
      tx: mb(i["tx-byte"]),
    })),
    fetchedAt: new Date().toISOString(),
  };
}

app.get("/api/dashboard", async (req, res) => {
  try {
    if (Date.now() - cache.at < 5000 && cache.data) return res.json(cache.data);
    const data = await fetchMikrotik();
    cache = { at: Date.now(), data };
    res.json(data);
  } catch (e) {
    console.error("[ERROR]", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/ping", (_req, res) => res.json({ ok: true, time: new Date() }));

app.listen(4000, () => {
  console.log("=======================================================");
  console.log("  Agent WiFi Control Pro JALAN");
  console.log("  Test di browser: http://localhost:4000/api/dashboard");
  console.log("  MikroTik target: " + MIKROTIK_HOST);
  console.log("=======================================================");
});
