export class WebRTCClient {
  constructor(myId, onMessage, urls) {
    this.myId = myId;
    this.onMessage = onMessage;
    this.urls = urls || [
      "wss://quick-ferret-74.deno.dev",
    ];
    this.ws = null;
    this.pc = null;
    this.dc = null;
    this.mediaStream = null;
    this.remoteStream = null;
    this._connect();
  }

  async _connect() {
    for (let url of this.urls) {
      try {
        await this._initWebSocket(url);
        return;
      } catch (e) {
        console.warn(`Failed to connect to ${url}:`, e.message);
      }
    }
    throw new Error("No available signaling servers.");
  }

  _initWebSocket(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onerror = reject;
      ws.onopen = () => {
        this.ws = ws;
        ws.onmessage = async (event) => {
          const data = JSON.parse(event.data);
          if (data.__error === "ID_TAKEN" && data.id === this.myId) {
            ws.close();
            throw new Error("ID_TAKEN");
          }
          if (this.myId in data) {
            await this._acceptOffer(data[this.myId]);
          }
        };
        ws.send(JSON.stringify({ __register: this.myId }));
        resolve();
      };
    });
  }

  async _acceptOffer(offer) {
    this.pc = new RTCPeerConnection();
    this.pc.ondatachannel = (e) => {
      this.dc = e.channel;
      this.dc.onmessage = (e) => this.onMessage?.(e.data);
    };
    this.pc.ontrack = (e) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        if (this.onRemoteStream) this.onRemoteStream(this.remoteStream);
      }
      this.remoteStream.addTrack(e.track);
    };
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.ws.send(JSON.stringify({ [this.myId]: this.pc.localDescription }));
  }

  async call(targetId, useMedia = false) {
    this.pc = new RTCPeerConnection();
    if (useMedia) {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        this.mediaStream.getTracks().forEach(track => {
          this.pc.addTrack(track, this.mediaStream);
        });
      } catch (e) {
        console.error("Media access error:", e);
        return;
      }
    } else {
      this.dc = this.pc.createDataChannel("chat");
      this.dc.onmessage = (e) => this.onMessage?.(e.data);
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.ws.send(JSON.stringify({ [targetId]: this.pc.localDescription }));
  }

  sendMessage(msg) {
    if (this.dc?.readyState === "open") {
      this.dc.send(msg);
    }
  }

  onRemoteStream(callback) {
    this.onRemoteStream = callback;
  }

  getLocalMediaStream() {
    return this.mediaStream || null;
  }

  getRemoteMediaStream() {
    return this.remoteStream || null;
  }
}
