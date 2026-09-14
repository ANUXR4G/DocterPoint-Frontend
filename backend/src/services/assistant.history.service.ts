import { prisma } from "../db/prisma.js";
import { AppError } from "../core/response.js";

function titleFromMessage(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}…` : cleaned;
}

export type AssistantConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string | null;
};

export type AssistantStoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export const AssistantHistoryService = {
  async list(userId: string): Promise<AssistantConversationSummary[]> {
    const rows = await prisma.assistantConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 40,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      preview: row.messages[0]?.content?.slice(0, 120) ?? null,
    }));
  },

  async get(
    userId: string,
    conversationId: string,
  ): Promise<{
    id: string;
    title: string;
    updatedAt: string;
    messages: AssistantStoredMessage[];
  }> {
    const row = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    });
    if (!row) throw new AppError(404, "Conversation not found.");

    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      messages: row.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  },

  async create(userId: string, title?: string): Promise<{ id: string; title: string }> {
    const row = await prisma.assistantConversation.create({
      data: {
        userId,
        title: (title?.trim() || "New chat").slice(0, 160),
      },
    });
    return { id: row.id, title: row.title };
  },

  async ensureOwned(userId: string, conversationId: string): Promise<void> {
    const row = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!row) throw new AppError(404, "Conversation not found.");
  },

  async appendTurn(input: {
    userId: string;
    conversationId?: string | null;
    userMessage: string;
    assistantReply: string;
  }): Promise<{ conversationId: string; title: string }> {
    const userMessage = input.userMessage.trim();
    const assistantReply = input.assistantReply.trim();
    if (!userMessage || !assistantReply) {
      throw new AppError(400, "Cannot save empty chat turn.");
    }

    const nextTitle = titleFromMessage(userMessage);
    let conversationId = input.conversationId?.trim() || "";
    let title = nextTitle;

    if (conversationId) {
      const existing = await prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId: input.userId },
        select: { id: true, title: true },
      });
      if (!existing) throw new AppError(404, "Conversation not found.");
      title =
        existing.title && existing.title !== "New chat"
          ? existing.title
          : nextTitle;
    } else {
      const created = await prisma.assistantConversation.create({
        data: { userId: input.userId, title: nextTitle },
      });
      conversationId = created.id;
      title = created.title;
    }

    await prisma.$transaction([
      prisma.assistantMessage.createMany({
        data: [
          {
            conversationId,
            role: "user",
            content: userMessage.slice(0, 4000),
          },
          {
            conversationId,
            role: "assistant",
            content: assistantReply.slice(0, 4000),
          },
        ],
      }),
      prisma.assistantConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date(), title },
      }),
    ]);

    return { conversationId, title };
  },

  async remove(userId: string, conversationId: string): Promise<void> {
    const result = await prisma.assistantConversation.deleteMany({
      where: { id: conversationId, userId },
    });
    if (!result.count) throw new AppError(404, "Conversation not found.");
  },
};
