from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from app.core.socket import WebSocketManager, socket_manager
from app.core.security import base64_to_uuid, uuid_to_base64

from app.models import Message
from app.db import get_async_db as db

from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone


router = APIRouter()
socket = WebSocketManager()


@router.websocket("/monitoring/{user_id}")
async def websocket_monitoring(
    ws: WebSocket,
    user_id: str,
):
    await socket_manager.connect(ws, f"{user_id}_MONITORING")
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        socket_manager.disconnect(ws, f"{user_id}_MONITORING")
        print(f"User #{user_id} left the monitoring room.")


@router.websocket("/chats/{user_id}")
async def websocket_chatting(
    ws: WebSocket,
    user_id: str,
    db: AsyncSession = Depends(db),
):
    await socket_manager.connect(ws, f"{user_id}_CHAT")
    try:
        while True:
            data = await ws.receive_json()
            # print(f"User Message -> , {data}", flush=True)

            # Communication B/W Admins and Users through Help Section
            if data["type"] == "help":
                new_help_msg_db = Message(
                    sender_id=base64_to_uuid(user_id),
                    content=data["content"],
                    created_at=datetime.now(timezone.utc),
                )

                # Store messages to database
                db.add(new_help_msg_db)
                await db.commit()
                await db.refresh(new_help_msg_db)

                new_help_msg = serialized_data(new_help_msg_db)

                # Broadcast the message data to the admins
                await socket_manager.broadcast_to_admins(new_help_msg)
                # Broadcast the message data to User as well
                await socket_manager.send_private_msg(f"{user_id}_CHAT", new_help_msg)

    except WebSocketDisconnect:
        socket_manager.disconnect(ws, f"{user_id}_CHAT")
        print(f"User #{user_id} left the help room.")


@router.websocket("/admin/help")
async def admin_websocket(
    ws: WebSocket,
    db: AsyncSession = Depends(db),
):
    await socket_manager.connect(ws)
    try:
        while True:
            data = await ws.receive_json()
            # print(f"Admin Messages -> {data}", flush=True)

            # handle admin replies
            if data["type"] == "reply":
                new_reply_msg_db = Message(
                    type="reply",
                    sender_id=base64_to_uuid(data["user_id"]),
                    content=data["content"],
                    created_at=datetime.now(timezone.utc),
                )

                # Store messages to database
                db.add(new_reply_msg_db)
                await db.commit()
                await db.refresh(new_reply_msg_db)

                new_reply_msg = serialized_data(new_reply_msg_db)

                # Broadcast the message data to User
                await socket_manager.send_private_msg(
                    f'{data["user_id"]}_CHAT', new_reply_msg
                )
                # Broadcast the message data to the admins as well
                await socket_manager.broadcast_to_admins(new_reply_msg)

    except WebSocketDisconnect:
        socket_manager.disconnect(ws)


def get_original_user_id_chat(room_id: str) -> str:
    suffix = "_CHAT"
    if room_id.endswith(suffix):
        return room_id[: -len(suffix)]
    return ""


def get_original_user_id_monitoring(room_id: str) -> str:
    suffix = "_MONITORING"
    if room_id.endswith(suffix):
        return room_id[: -len(suffix)]
    return ""


def serialized_data(msg: Message):
    return {
        "type": msg.type,
        "id": uuid_to_base64(msg.id),
        "sender_id": uuid_to_base64(msg.sender_id),
        "content": msg.content,
        "is_seen": msg.is_seen,
        "created_at": msg.created_at,
    }
