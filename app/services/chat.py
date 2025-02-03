from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, desc, and_, or_

from app.models import Message
from app.core.security import base64_to_uuid, uuid_to_base64


class ChatService:
    @staticmethod
    async def get_user_help_messages(
        db: AsyncSession,
        page: int,
        limit: int,
        user_id: str,
    ):

        page = max(1, page)  # allow page only to be greater than 1
        offset = (page - 1) * limit  # calcuate offset based on page and limit

        # Retrieve the messages based on the specific criteria
        query = (
            select(Message)
            .where(
                Message.sender_id == base64_to_uuid(user_id),
                Message.type.in_(["help", "reply"]),
            )
            .offset(offset)
            .limit(limit)
            .order_by(desc(Message.created_at))
        )

        # Count the amount of messages the user has
        count = select(func.count(Message.id)).where(
            Message.sender_id == base64_to_uuid(user_id),
            Message.type.in_(["help", "reply"]),
        )

        result = await db.execute(query)
        count_query = await db.execute(count)

        messages = result.scalars().all()
        total = count_query.scalar()

        data = [serialized_msg(msg) for msg in messages]

        return {"total": total, "messages": data}

    # Retrieve User's direct Messages
    async def get_user_direct_messages(
        db: AsyncSession,
        page: int,
        limit: int,
        user_id: str,
        receiver_id: str,
    ):

        page = max(1, page)  # allow page only to be greater than 1
        offset = (page - 1) * limit  # calcuate offset based on page and limit

        # Retrieve the messages based on the specific criteria
        query = (
            select(Message)
            .where(
                or_(
                    and_(
                        Message.sender_id == base64_to_uuid(user_id),
                        Message.receiver_id == base64_to_uuid(receiver_id),
                        Message.type == "direct",
                    ),
                    and_(
                        Message.sender_id == base64_to_uuid(receiver_id),
                        Message.receiver_id == base64_to_uuid(user_id),
                        Message.type == "direct",
                    ),
                )
            )
            .offset(offset)
            .limit(limit)
            .order_by(desc(Message.created_at))
        )

        # Count the amount of messages the user has
        count = select(func.count(Message.id)).where(
            Message.sender_id == base64_to_uuid(user_id),
            Message.receiver_id == base64_to_uuid(receiver_id),
            Message.type == "direct",
        )

        result = await db.execute(query)
        count_query = await db.execute(count)

        messages = result.scalars().all()
        total = count_query.scalar()

        data = [serialized_msg(msg) for msg in messages]

        return {"total": total, "messages": data}


def serialized_msg(data: Message):
    result = {
        "id": uuid_to_base64(data.id),
        "sender_id": uuid_to_base64(data.sender_id),
        **{
            key: val
            for key, val in data.__dict__.items()
            if key
            not in {
                "id",
                "sender_id",
                "receiver_id",
            }  # Exclude 'id', 'sender_id' and 'receiver_id'
        },
    }

    # Add receiver_id to result in exists
    if data.receiver_id:
        result["receiver_id"] = uuid_to_base64(data.receiver_id)

    return result
