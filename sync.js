/**
 * Robotics Arena Cross-Window Real-time Synchronization Engine
 * Uses Triple-Redundancy Architecture:
 *  1. BroadcastChannel API (Modern Web & PWA)
 *  2. Direct Window postMessage API (cross-window file:/// support)
 *  3. LocalStorage Atomic Keys + Ultra-Fast 50ms Polling Fallback (100% offline & file:/// safe)
 *  4. LAN relay (server.js): when the page is opened from the Node server over http://,
 *     messages are also relayed to every other computer/browser/OBS on the network
 */

class ArenaSyncBus {
  constructor(channelName = 'robot_arena_sync_channel') {
    this.channelName = channelName;
    this.channel = null;
    this.listeners = new Map();
    this.seenMsgIds = new Set();
    this.seq = 0;
    this.windowId = window.__windowId || (window.__windowId = Math.random().toString(36).substring(2, 9));
    this.lanOnline = false;   // true while connected to the LAN relay (server.js)
    this.lanClients = 0;      // number of screens connected to the relay
    this.init();
  }

  init() {
    // 1. BroadcastChannel Init
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event) => {
          this.handleIncoming(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel unavailable, using storage/direct fallback', e);
      }
    }

    // 2. Direct Window postMessage Listener (cross-window file:/// support)
    window.addEventListener('message', (event) => {
      if (event.data && (event.data.channelName === this.channelName || event.data.type)) {
        this.handleIncoming(event.data);
      }
    });

    // 3. Storage Event Listener
    window.addEventListener('storage', (event) => {
      if (event.key === `sync_event_${this.channelName}` && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);
          this.handleIncoming(payload);
        } catch (e) {}
      }
    });

    // 4. Fast Polling Fallback (every 50ms) for environments where storage events are blocked
    setInterval(() => {
      this.pollStorageFallback();
    }, 50);

    // 5. LAN relay (other computers / OBS) — only when served by server.js over http(s)
    this.initLanRelay();
  }

  // Deliver an event to this window's own listeners only (no dedup / no re-broadcast)
  dispatchLocal(type, payload = {}) {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    handlers.forEach(fn => {
      try { fn(payload, { type, payload, local: true }); } catch (err) { console.error(err); }
    });
  }

  initLanRelay() {
    if (!/^https?:$/.test(location.protocol) || typeof EventSource === 'undefined') return;

    // Optional shared password: open the site as  https://...onrender.com/?key=XXXX
    const keyParam = new URLSearchParams(location.search).get('key');
    this.lanQuery = keyParam ? `?key=${encodeURIComponent(keyParam)}` : '';
    this.lanEverOnline = false;

    const connect = () => {
      let es;
      try {
        es = new EventSource('events' + this.lanQuery); // relative URL: works from any base path
      } catch (e) {
        return;
      }
      es.onopen = () => {
        this.lanOnline = true;
        this.lanEverOnline = true;
        this.dispatchLocal('LAN_STATUS', { online: true, count: this.lanClients });
        this.dispatchLocal('LAN_CONNECTED'); // lets a late-joining / re-connected screen ask for the current state
      };
      es.onmessage = (event) => {
        try { this.handleIncoming(JSON.parse(event.data)); } catch (e) {}
      };
      es.addEventListener('presence', (event) => {
        try { this.lanClients = JSON.parse(event.data).count || 0; } catch (e) {}
        this.dispatchLocal('LAN_STATUS', { online: this.lanOnline, count: this.lanClients });
      });
      es.onerror = () => {
        this.lanOnline = false;
        this.lanClients = 0;
        this.dispatchLocal('LAN_STATUS', { online: false, count: 0 });
        // Network drop: the browser retries by itself. If the server answered with an error
        // (e.g. a hosting service that is still waking up) the browser gives up, so retry manually —
        // but only if the relay worked before (a plain static server without /events is never retried).
        if (es.readyState === 2 && this.lanEverOnline) {
          es.close();
          setTimeout(connect, 3000);
        }
      };
    };
    connect();
  }

  // Subscribe to specific message types
  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
  }

  // Emit event to all connected windows/screens
  emit(type, payload = {}) {
    const msgId = `${this.windowId}_${Date.now()}_${++this.seq}`;
    this.seenMsgIds.add(msgId);
    if (this.seenMsgIds.size > 300) {
      const first = this.seenMsgIds.values().next().value;
      this.seenMsgIds.delete(first);
    }

    const message = {
      channelName: this.channelName,
      msgId,
      type,
      payload,
      timestamp: Date.now(),
      senderId: this.windowId
    };

    // A. BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch (e) {}
    }

    // B. Direct Child Windows (window.open references)
    if (window.__openedChildWindows && Array.isArray(window.__openedChildWindows)) {
      window.__openedChildWindows.forEach((w) => {
        if (w && !w.closed) {
          try {
            w.postMessage(message, '*');
          } catch (e) {}
        }
      });
    }

    // C. Window Opener (if this is a popup/child window)
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(message, '*');
      } catch (e) {}
    }

    // D. LocalStorage Fallback
    try {
      localStorage.setItem(`sync_event_${this.channelName}`, JSON.stringify(message));
    } catch (e) {}

    // E. LAN relay (other computers / OBS)
    if (this.lanOnline) {
      try {
        fetch('emit' + this.lanQuery, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
          keepalive: true
        }).catch(() => {});
      } catch (e) {}
    }
  }

  pollStorageFallback() {
    try {
      const raw = localStorage.getItem(`sync_event_${this.channelName}`);
      if (raw) {
        const msg = JSON.parse(raw);
        if (msg && msg.msgId && !this.seenMsgIds.has(msg.msgId) && msg.senderId !== this.windowId) {
          this.handleIncoming(msg);
        }
      }
    } catch (e) {}
  }

  handleIncoming(message) {
    if (!message || !message.type) return;
    if (message.senderId && message.senderId === this.windowId) return;

    if (message.msgId) {
      if (this.seenMsgIds.has(message.msgId)) return;
      this.seenMsgIds.add(message.msgId);
      if (this.seenMsgIds.size > 300) {
        const first = this.seenMsgIds.values().next().value;
        this.seenMsgIds.delete(first);
      }
    }

    const handlers = this.listeners.get(message.type);
    if (handlers) {
      handlers.forEach(fn => {
        try {
          fn(message.payload, message);
        } catch (err) {
          console.error(`Error in sync handler for ${message.type}:`, err);
        }
      });
    }

    // Wildcard listeners
    const anyHandlers = this.listeners.get('*');
    if (anyHandlers) {
      anyHandlers.forEach(fn => {
        try {
          fn(message.type, message.payload, message);
        } catch (err) {}
      });
    }
  }
}

// Global Sync Bus Instance
const arenaSync = new ArenaSyncBus();
window.arenaSync = arenaSync;
