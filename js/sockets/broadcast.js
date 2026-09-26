class BroadcastSocketAdapter {
  constructor(roomCode, onMessageCallback, isHost = true) {
    this.roomCode = roomCode;
    this.onMessage = onMessageCallback;
    this.isHost = isHost;
    this.channel = new BroadcastChannel(`worldbox_lan_${roomCode}`);
    this.connected = true;

    this.channel.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'WHO_IS_HOST' && data.roomCode === this.roomCode) {
        if (this.isHost) {
          this.send({ type: 'I_AM_HOST', roomCode: this.roomCode });
        }
      } else if (data.type === 'I_AM_HOST' && data.roomCode === this.roomCode) {
        if (this.isHost) {
          this.isHost = false;
          if (this.onMessage) {
            this.onMessage({ type: 'ROLE_ASSIGNMENT', isHost: false, roomCode: this.roomCode });
          }
        }
      }

      if (this.onMessage) {
        this.onMessage(data);
      }
    };

    setTimeout(() => {
      this.send({ type: 'WHO_IS_HOST', roomCode: this.roomCode });
      this.send({ type: 'PEER_JOINED', roomCode: this.roomCode });
    }, 100);
  }

  send(packet) {
    if (this.channel && this.connected) {
      try {
        this.channel.postMessage(packet);
      } catch (e) {}
    }
  }

  close() {
    this.connected = false;
    if (this.channel) {
      this.channel.close();
    }
  }
}
