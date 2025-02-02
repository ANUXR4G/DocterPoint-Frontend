from pydantic import BaseModel


class ChatBase(BaseModel):
    def none_excluded(self):
        return {k: v for k, v in self.model_dump().items() if v is not None}

    def is_empty(self) -> bool:
        return all(value is None for value in self.model_dump().values())

    pass


class ChatMutation(ChatBase):
    content: str
    message_type: str
    sender_id: str = None
    receiver_id: str = None
