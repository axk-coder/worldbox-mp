class BroadcastSocketAdapter {
  constructor(roomCode, onMessageCallback) {
    this.roomCode = roomCode;
    this.onMessage = onMessageCallback;
    this.channel = new BroadcastChannel(`worldbox_lan_${roomCode}`);
    this.connected = true;

    this.channel.onmessage = (event) => {
      if (this.onMessage && event.data) {
        this.onMessage(event.data);
      }
    };
  }

  send(packet) {
    if (this.channel && this.connected) {
      this.channel.postMessage(packet);
    }
  }

  close() {
    this.connected = false;
    if (this.channel) {
      this.channel.close();
    }
  }
}
