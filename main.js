export class WebRTCClient {
  constructor(myId, onMessage, urls) {
    this.myId = myId;
    this.urls = urls || [
      "wss://quick-ferret-74.deno.dev",
      // add backup URLs here
    ];
    this.onMessage = onMessage;
    this.mediaStream = null;
    this.ws = null;
    this.pc = null;
    this.dc = null;
    this._connect();
  }

  async _connect() {
    for (let url of this.urls) {
      try {
        this.ws = new WebSocket(url);
        this.ws.onmessage = async (e) => {
          const data = JSON.parse(e.data);
          if (this.myId in data) {
            await this._acceptOffer(data[this.myId]);
          }
        };
        return;
      } catch (e) {
        console.warn("Failed to connect to:", url);
      }
    }
    throw new Error("No available signaling servers.");
  }

  async _acceptOffer(offer) {
    this.pc = new RTCPeerConnection();

    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this.dc.onmessage = (e) => this.onMessage?.(e.data);
    };

    this.pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        if (this.onRemoteStream) {
          this.onRemoteStream(this.remoteStream);
        }
      }
      this.remoteStream.addTrack(event.track);
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
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        this.mediaStream.getTracks().forEach((track) => {
          this.pc.addTrack(track, this.mediaStream);
        });
      } catch (err) {
        console.error("Media permission denied or error:", err);
        return;
      }
    } else {
      this.dc = this.pc.createDataChannel("chat");
      this.dc.onmessage = (e) => this.onMessage?.(e.data);
    }

    await this.pc.setLocalDescription(await this.pc.createOffer());
    this.ws.send(JSON.stringify({ [targetId]: this.pc.localDescription }));
  }

  sendMessage(msg) {
    if (this.dc && this.dc.readyState === "open") {
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
