from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.socket import WebSocketManager, socket_manager


router = APIRouter()
socket = WebSocketManager()


@router.websocket("/monitoring/{room_id}")
async def websocket_monitoring(
    websocket: WebSocket,
    room_id: str,
):
    await socket_manager.connect(websocket, room_id)
    try:
        while True:
            await websocket.receive_text()  # keep the connection alive
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket, room_id)
        print(f"patient #{id} left the monitoring room!")
