// Transports. Both hand out connections shaped like a PeerJS DataConnection:
//   conn.on("open" | "data" | "close", fn), conn.send(obj), conn.close()
// `peer` uses WebRTC through PeerJS's public signaling server; `local` uses a BroadcastChannel
// between tabs of one browser, for the tests (?net=local).

const PREFIX = "quasarbright-chips-";

class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this._h[ev] || []) fn(...a); }
}

/* ------------------------------ PeerJS ------------------------------ */

let peerLib;
function loadPeer() {
  return (peerLib ||= new Promise((res, rej) => {
    if (window.Peer) return res(window.Peer);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
    s.onload = () => res(window.Peer);
    s.onerror = () => { peerLib = null; rej(new Error("Couldn't load the networking library. Check your connection.")); };
    document.head.appendChild(s);
  }));
}

// Host a table. onConn(conn) fires for each player connection once it's open.
// onStatus("online" | "connecting" | "error", message?) reports the host's link to the signaling server.
async function peerHost(code, { onConn, onStatus }) {
  const Peer = await loadPeer();
  let peer, dead = false, tries = 0;
  const start = () => {
    onStatus("connecting");
    peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on("open", () => { tries = 0; onStatus("online"); });
    peer.on("connection", (c) => c.on("open", () => onConn(c)));
    peer.on("disconnected", () => { if (!dead) { onStatus("connecting"); setTimeout(() => !dead && !peer.destroyed && peer.reconnect(), 1000); } });
    peer.on("error", (e) => {
      if (dead) return;
      if (e.type === "unavailable-id") {
        // a reload: the old session still holds the id for a few seconds
        peer.destroy();
        if (++tries < 15) setTimeout(start, 2000);
        else onStatus("error", "This table is already open in another tab or on another device. Close it there, then reload.");
      } else if (e.type === "network" || e.type === "server-error" || e.type === "socket-error" || e.type === "socket-closed") {
        onStatus("connecting");
      }
    });
  };
  start();
  return { close() { dead = true; peer?.destroy(); } };
}

// Connect to a table's host. Resolves with an open conn, rejects if the host can't be reached.
async function peerJoin(code) {
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    let settled = false;
    const done = (err, conn) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (err) { peer.destroy(); reject(err); } else resolve(conn);
    };
    const timer = setTimeout(() => done(new Error("timeout")), 15000);
    peer.on("error", (e) => done(new Error(e.type === "peer-unavailable" ? "unavailable" : e.type || "error")));
    peer.on("open", () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
      conn.on("open", () => done(null, conn));
      conn.on("error", () => done(new Error("error")));
      // when the conn dies, drop the whole peer so a reconnect starts clean
      conn.on("close", () => setTimeout(() => peer.destroy(), 0));
    });
  });
}

/* --------------------------- BroadcastChannel --------------------------- */

function localConn(ch, me, them) {
  const c = new Emitter();
  c.open = true;
  c.send = (data) => { if (c.open) ch.postMessage({ from: me, to: them, kind: "data", data }); };
  c.close = () => { if (!c.open) return; c.open = false; ch.postMessage({ from: me, to: them, kind: "close" }); c.emit("close"); };
  c._recv = (m) => {
    if (m.kind === "data") c.emit("data", m.data);
    else if (m.kind === "close" && c.open) { c.open = false; c.emit("close"); }
  };
  addEventListener("pagehide", () => c.close());
  return c;
}

async function localHost(code, { onConn, onStatus }) {
  const ch = new BroadcastChannel("chips:" + code), conns = new Map();
  ch.onmessage = ({ data: m }) => {
    if (m.to !== "host") return;
    if (m.kind === "connect") {
      const c = localConn(ch, "host", m.from);
      conns.set(m.from, c);
      c.on("close", () => conns.delete(m.from));
      ch.postMessage({ from: "host", to: m.from, kind: "accept" });
      onConn(c);
    } else conns.get(m.from)?._recv(m);
  };
  setTimeout(() => onStatus("online"));
  return { close() { for (const c of conns.values()) c.close(); ch.close(); } };
}

async function localJoin(code) {
  const ch = new BroadcastChannel("chips:" + code), me = "c" + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    let conn;
    const timer = setTimeout(() => { ch.close(); reject(new Error("unavailable")); }, 1500);
    ch.onmessage = ({ data: m }) => {
      if (m.to !== me) return;
      if (m.kind === "accept") { clearTimeout(timer); conn = localConn(ch, me, "host"); conn.on("close", () => ch.close()); resolve(conn); }
      else conn?._recv(m);
    };
    ch.postMessage({ from: me, to: "host", kind: "connect" });
  });
}

export function transport(kind) {
  return kind === "local" ? { host: localHost, join: localJoin } : { host: peerHost, join: peerJoin };
}
