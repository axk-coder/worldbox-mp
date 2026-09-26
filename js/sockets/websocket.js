class WebSocketAdapter {
  constructor(serverUrl, roomCode, onMessageCallback, isHost = true) {
    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultUrl = loc.hostname ? `${wsProto}//${loc.hostname}:${loc.port || 8080}` : 'ws://localhost:8080';
    this.url = serverUrl ? serverUrl.replace(/^http/, 'ws') : defaultUrl;
    this.roomCode = roomCode;
    this.isHost = isHost;
    this.onMessage = onMessageCallback;
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.shouldReconnect = true;
    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.connected = true;
        this.send({ type: 'JOIN_ROOM', roomCode: this.roomCode, requestedRole: this.isHost ? 'host' : 'client', isHost: this.isHost });
        this.send({ type: 'WHO_IS_HOST', roomCode: this.roomCode });
      };
      this.ws.onmessage = (event) => {
        if (this.onMessage) {
          try {
            const data = JSON.parse(event.data);
            if (data) {
              if (data.type === 'WHO_IS_HOST' && data.roomCode === this.roomCode) {
                if (this.isHost) {
                  this.send({ type: 'I_AM_HOST', roomCode: this.roomCode });
                }
              } else if (data.type === 'I_AM_HOST' && data.roomCode === this.roomCode) {
                if (this.isHost) {
                  this.isHost = false;
                  this.onMessage({ type: 'ROLE_ASSIGNMENT', isHost: false, roomCode: this.roomCode });
                }
              }
            }
            this.onMessage(data);
          } catch (e) {}
        }
      };
      this.ws.onclose = () => {
        this.connected = false;
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };
      this.ws.onerror = () => {
        this.connected = false;
      };
    } catch (e) {
      this.connected = false;
    }
  }

  send(packet) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }
  }

  close() {
    this.shouldReconnect = false;
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
    }
  }
}
