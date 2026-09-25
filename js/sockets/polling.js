class PollingSocketAdapter {
  constructor(serverUrl, roomCode, onMessageCallback) {
    this.serverUrl = serverUrl || `http://${window.location.hostname}:8080`;
    this.roomCode = roomCode;
    this.onMessage = onMessageCallback;
    this.connected = true;
    this.pollInterval = null;
    this.startPolling();
  }

  startPolling() {
    this.pollInterval = setInterval(async () => {
      if (!this.connected) return;
      try {
        const res = await fetch(`${this.serverUrl}/poll?room=${this.roomCode}`);
        if (res.ok) {
          const packets = await res.json();
          if (Array.isArray(packets)) {
            packets.forEach(pkg => {
              if (this.onMessage) this.onMessage(pkg);
            });
          }
        }
      } catch (e) {}
    }, 500);
  }

  async send(packet) {
    if (!this.connected) return;
    try {
      await fetch(`${this.serverUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: this.roomCode, packet })
      });
    } catch (e) {}
  }

  close() {
    this.connected = false;
    if (this.pollInterval) clearInterval(this.pollInterval);
  }
}
