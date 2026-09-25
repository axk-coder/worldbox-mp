class WebSocketAdapter {
  constructor(serverUrl, roomCode, onMessageCallback) {
    this.url = serverUrl || `ws://${window.location.hostname}:8080`;
    this.roomCode = roomCode;
    this.onMessage = onMessageCallback;
    this.ws = null;
    this.connected = false;
    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.connected = true;
        this.send({ type: 'JOIN_ROOM', roomCode: this.roomCode });
      };
      this.ws.onmessage = (event) => {
        if (this.onMessage) {
          try {
            const data = JSON.parse(event.data);
            this.onMessage(data);
          } catch (e) {}
        }
      };
      this.ws.onclose = () => {
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
    this.connected = false;
    if (this.ws) {
      this.ws.close();
    }
  }
}
