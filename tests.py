# example_text_only.py
from pywebrtc import WebRTCClient
import asyncio

async def main():
    client = WebRTCClient("me", "you")
    await client.connect()
    await asyncio.sleep(1)
    await client.call()
    while True:
        client.send_message("text message")
        await asyncio.sleep(5)

asyncio.run(main())
