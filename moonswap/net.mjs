// Two interchangeable transports with the same shape:
//   host(code, { onConnect(id), onMessage(id, msg), onClose(id) }) -> Promise<{ send(id, msg), drop(id), close() }>
//       rejects with Error("taken") when someone else already hosts that room
//   guest(code, { onOpen(), onMessage(msg), onClose(reason) }) -> { send(msg), close() }
//
// `peer` is the real one: WebRTC data channels through PeerJS. PeerJS's free public broker only
// introduces the browsers to each other; after that, messages go browser to browser.
// `local` uses a BroadcastChannel, so tabs of one browser can play each other (?net=local).
// It exists for tests and for trying the game alone.

const PREFIX = "moonswap-v1-";

export function makeNet(kind) {
  return kind === "local" ? localNet : peerNet;
}

// ---------------------------------------------------------------- PeerJS

const peerNet = {
  host(code, { onConnect, onMessage, onClose }) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(PREFIX + code, { debug: 1 });
      const conns = new Map();
      let opened = false;
      peer.on("open", () => {
        opened = true;
        resolve({
          send(id, msg) { const c = conns.get(id); if (c?.open) c.send(msg); },
          drop(id) { conns.get(id)?.close(); },
          close() { peer.destroy(); },
        });
      });
      peer.on("connection", (conn) => {
        const id = conn.connectionId;
        conn.on("open", () => { conns.set(id, conn); onConnect(id); });
        conn.on("data", (d) => onMessage(id, d));
        conn.on("close", () => { if (conns.delete(id)) onClose(id); });
        conn.on("error", () => {});
      });
      peer.on("error", (e) => {
        if (!opened) { peer.destroy(); reject(e.type === "unavailable-id" ? new Error("taken") : e); }
      });
      // lost the broker (not the players): get back on it so new players can still join
      peer.on("disconnected", () => { if (opened && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1000); });
    });
  },

  guest(code, { onOpen, onMessage, onClose }) {
    const peer = new window.Peer({ debug: 1 });
    let conn = null;
    let ended = false;
    const end = (reason) => { if (ended) return; ended = true; peer.destroy(); onClose(reason); };
    peer.on("open", () => {
      conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on("open", onOpen);
      conn.on("data", onMessage);
      conn.on("close", () => end("closed"));
      conn.on("error", () => end("error"));
    });
    peer.on("error", (e) => end(e.type === "peer-unavailable" ? "unavailable" : e.type));
    return {
      send(msg) { if (conn?.open) conn.send(msg); },
      close() { ended = true; peer.destroy(); },
    };
  },
};

// ---------------------------------------------------------------- BroadcastChannel

const rid = () => Math.random().toString(36).slice(2, 10);

const localNet = {
  host(code, { onConnect, onMessage, onClose }) {
    return new Promise((resolve, reject) => {
      const ch = new BroadcastChannel("moonswap-local-" + code);
      const me = rid();
      const conns = new Set();
      let claimed = false;
      ch.onmessage = ({ data: m }) => {
        if (m.k === "claim" && m.from !== me && claimed) ch.postMessage({ k: "taken", to: m.from });
        if (m.k === "taken" && m.to === me && !claimed) { ch.close(); reject(new Error("taken")); claimed = null; }
        if (!claimed) return;
        if (m.k === "g-open") { conns.add(m.conn); ch.postMessage({ k: "h-open", conn: m.conn }); onConnect(m.conn); }
        if (m.k === "g" && conns.has(m.conn)) onMessage(m.conn, m.d);
        if (m.k === "g-close" && conns.delete(m.conn)) onClose(m.conn);
      };
      ch.postMessage({ k: "claim", from: me });
      setTimeout(() => {
        if (claimed === null) return;
        claimed = true;
        resolve({
          send(id, d) { if (conns.has(id)) ch.postMessage({ k: "h", conn: id, d }); },
          drop(id) { if (conns.delete(id)) ch.postMessage({ k: "h-close", conn: id }); },
          close() { for (const id of conns) ch.postMessage({ k: "h-close", conn: id }); ch.close(); },
        });
      }, 300);
    });
  },

  guest(code, { onOpen, onMessage, onClose }) {
    const ch = new BroadcastChannel("moonswap-local-" + code);
    const conn = rid();
    let open = false, ended = false;
    const end = (reason) => { if (ended) return; ended = true; ch.close(); onClose(reason); };
    ch.onmessage = ({ data: m }) => {
      if (m.conn !== conn) return;
      if (m.k === "h-open") { open = true; onOpen(); }
      if (m.k === "h") onMessage(m.d);
      if (m.k === "h-close") end("closed");
    };
    ch.postMessage({ k: "g-open", conn });
    setTimeout(() => { if (!open) end("unavailable"); }, 1500);
    return {
      send(d) { if (open && !ended) ch.postMessage({ k: "g", conn, d }); },
      close() { if (!ended) { ended = true; ch.postMessage({ k: "g-close", conn }); ch.close(); } },
    };
  },
};
