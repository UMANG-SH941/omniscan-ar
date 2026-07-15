@echo off
REM Public HTTPS tunnel to the local backend — the printed
REM https://xxx.trycloudflare.com URL goes in the app's server settings.
REM (--protocol http2 because some networks block UDP/QUIC)
"%~dp0cloudflared.exe" tunnel --protocol http2 --url http://localhost:8001
