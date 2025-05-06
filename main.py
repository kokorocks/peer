import asyncio
import aiohttp
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCDataChannel

class WebRTCClient:
    def __init__(self, my_id, target_id, urls=None):
        self.my_id = my_id
        self.target_id = target_id
        self.urls = urls or [
            "wss://quick-ferret-74.deno.dev",
            # add more failover URLs here
        ]
        self.pc = RTCPeerConnection()
        self.dc = None
        self.ws = None
        self.video_audio_enabled = False

    async def _connect_signaling(self):
        for url in self.urls:
            try:
                session = aiohttp.ClientSession()
                self.ws = await session.ws_connect(url)
                return
            except:
                continue
        raise Exception("Could not connect to any signaling server.")

    async def connect(self):
        await self._connect_signaling()

        @self.pc.on("datachannel")
        def on_datachannel(channel):
            self.dc = channel
            self.dc.on("message", lambda msg: print(f"[{self.target_id}] {msg}"))

        # Poll for offers
        async def poll():
            while True:
                await self.ws.send_json({"id": self.my_id})
                msg = await self.ws.receive_json()
                if self.target_id in msg:
                    await self.pc.setRemoteDescription(RTCSessionDescription(
                        msg[self.target_id]["sdp"], msg[self.target_id]["type"]))
                    answer = await self.pc.createAnswer()
                    await self.pc.setLocalDescription(answer)
                    await self.ws.send_json({self.my_id: {
                        "sdp": self.pc.localDescription.sdp,
                        "type": self.pc.localDescription.type
                    }})
                    break
                await asyncio.sleep(1)
        asyncio.create_task(poll())

    async def call(self):
        self.dc = self.pc.createDataChannel("chat")
        await self.pc.setLocalDescription(await self.pc.createOffer())
        await self.ws.send_json({self.target_id: {
            "sdp": self.pc.localDescription.sdp,
            "type": self.pc.localDescription.type
        }})

    def send_message(self, text):
        if self.dc:
            self.dc.send(text)

    async def enable_video_audio(self):
        self.video_audio_enabled = True
        try:
            from aiortc.contrib.media import MediaPlayer
        except ImportError:
            raise RuntimeError("Install 'aiortc' and 'av' to enable video/audio.")

        player = MediaPlayer("/dev/video0", format="v4l2", options={"video_size": "640x480"})
        if player.audio:
            self.pc.addTrack(player.audio)
        if player.video:
            self.pc.addTrack(player.video)
