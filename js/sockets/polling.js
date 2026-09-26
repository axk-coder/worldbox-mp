class PollingSocketAdapter {
  constructor(serverUrl, roomCode, onMessageCallback, isHost = true) {
    const loc = window.location;
    const defaultUrl = loc.origin && loc.origin.startsWith('http') ? loc.origin : `${loc.protocol || 'http:'}//${loc.hostname || 'localhost'}:${loc.port || 8080}`;
    this.serverUrl = serverUrl || defaultUrl;
    this.roomCode = roomCode;
    this.isHost = isHost;
    this.onMessage = onMessageCallback;
    this.connected = true;
    this.clientId = `client_${Math.floor(Math.random() * 899999 + 100000)}`;
    this.lastId = 0;
    this.pollInterval = null;
    this.startPolling();
    setTimeout(() => {
      this.send({ type: 'WHO_IS_HOST', roomCode: this.roomCode });
    }, 200);
  }

  startPolling() {
    this.pollInterval = setInterval(async () => {
      if (!this.connected) return;
      try {
        const res = await fetch(`${this.serverUrl}/poll?room=${encodeURIComponent(this.roomCode)}&clientId=${encodeURIComponent(this.clientId)}&since=${this.lastId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.packets)) {
            data.packets.forEach(item => {
              if (item.id > this.lastId) {
                this.lastId = item.id;
              }
              if (item.packet) {
                if (item.packet.type === 'WHO_IS_HOST' && item.packet.roomCode === this.roomCode) {
                  if (this.isHost) {
                    this.send({ type: 'I_AM_HOST', roomCode: this.roomCode });
                  }
                } else if (item.packet.type === 'I_AM_HOST' && item.packet.roomCode === this.roomCode) {
                  if (this.isHost) {
                    this.isHost = false;
                    if (this.onMessage) {
                      this.onMessage({ type: 'ROLE_ASSIGNMENT', isHost: false, roomCode: this.roomCode });
                    }
                  }
                }
              }
              if (this.onMessage && item.packet) {
                this.onMessage(item.packet);
              }
            });
          }
          if (data && typeof data.lastId === 'number' && data.lastId > this.lastId) {
            this.lastId = data.lastId;
          }
        }
      } catch (e) {}
    }, 300);
  }

  async send(packet) {
    if (!this.connected) return;
    try {
      await fetch(`${this.serverUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: this.roomCode, clientId: this.clientId, packet })
      });
    } catch (e) {}
  }

  close() {
    this.connected = false;
    if (this.pollInterval) clearInterval(this.pollInterval);
  }
}
