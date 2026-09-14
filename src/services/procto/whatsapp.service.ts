import { prisma } from "../../db/prisma.js";
import {
  downloadWhatsAppMedia,
  isSttConfigured,
  sendWhatsAppText,
  transcribeAudio,
} from "./whatsapp.client.js";
import { BotPrompts } from "./whatsapp.templates.js";
import { resolveLang } from "./whatsapp.i18n.js";
import {
  normalizePhone,
  runOrchestrator,
  type ConversationState,
} from "./whatsapp.orchestrator.js";
import { NumberPoolService } from "./numberPool.service.js";
import { PracticeSubscriptionStatus } from "@prisma/client";
import { IdScanService, type IdScanFields } from "../idScan.js";
import { PatientService } from "../patient.js";
import { settings } from "../../config/index.js";

function isIdOcrConfigured(): boolean {
  return Boolean(settings.openaiApiKey || settings.hfToken);
}

function isOcrableImageMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return (
    m.includes("jpeg") ||
    m.includes("jpg") ||
    m.includes("png") ||
    m.includes("webp")
  );
}

type MetaMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string; voice?: boolean };
  /** Some Cloud API payloads use this for voice notes */
  voice?: { id: string; mime_type?: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: {
    id: string;
    mime_type?: string;
    filename?: string;
    caption?: string;
  };
  /** Template quick-reply taps */
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
};

/** Normalize inbound WhatsApp text from plain text, buttons, or list picks. */
function extractInboundText(message: MetaMessage): string {
  if (message.type === "text" && message.text?.body) {
    return message.text.body.trim();
  }
  if (message.type === "button") {
    return (
      message.button?.text?.trim() ||
      message.button?.payload?.trim() ||
      ""
    );
  }
  if (message.type === "interactive") {
    const btn = message.interactive?.button_reply;
    if (btn?.title?.trim() || btn?.id?.trim()) {
      return (btn.title || btn.id || "").trim();
    }
    const list = message.interactive?.list_reply;
    if (list?.title?.trim() || list?.id?.trim()) {
      return (list.title || list.id || "").trim();
    }
  }
  // Some payloads omit type but still include button/interactive
  if (message.button?.text || message.button?.payload) {
    return (message.button.text || message.button.payload || "").trim();
  }
  if (message.interactive?.button_reply) {
    const btn = message.interactive.button_reply;
    return (btn.title || btn.id || "").trim();
  }
  if (message.interactive?.list_reply) {
    const list = message.interactive.list_reply;
    return (list.title || list.id || "").trim();
  }
  return "";
}

function extractMetaMessages(body: unknown): Array<{
  from: string;
  to: string;
  phoneNumberId?: string;
  message: MetaMessage;
}> {
  const results: Array<{
    from: string;
    to: string;
    phoneNumberId?: string;
    message: MetaMessage;
  }> = [];
  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { display_phone_number?: string; phone_number_id?: string };
          messages?: MetaMessage[];
        };
      }>;
    }>;
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;
      const to = value.metadata?.display_phone_number ?? "";
      const phoneNumberId = value.metadata?.phone_number_id;
      for (const message of value.messages) {
        results.push({ from: message.from, to, phoneNumberId, message });
      }
    }
  }

  return results;
}

function phoneMatches(stored: string | null | undefined, digits: string): boolean {
  if (!stored) return false;
  return normalizePhone(stored) === digits;
}

/** True if this phone belongs to a doctor, clinic owner/staff, or clinic business line. */
export async function isStaffOrClinicPhone(
  phone: string,
  practice: {
    id?: string;
    phone?: string | null;
    whatsappBusinessNumber?: string | null;
  },
): Promise<boolean> {
  const digits = normalizePhone(phone);
  if (digits.length < 10) return false;

  if (
    phoneMatches(practice.phone, digits) ||
    phoneMatches(practice.whatsappBusinessNumber, digits)
  ) {
    return true;
  }

  const [doctorUser, member] = await Promise.all([
    prisma.user.findFirst({
      where: {
        role: "doctor",
        phone: { endsWith: digits },
      },
      select: { id: true },
    }),
    prisma.practiceMember.findFirst({
      where: {
        isActive: true,
        role: {
          in: ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN", "RECEPTIONIST"],
        },
        user: { phone: { endsWith: digits } },
      },
      select: { id: true },
    }),
  ]);
  if (doctorUser || member) return true;

  // Doctor.contactNumbers is JSON — check members of this practice
  const practiceMembers = practice.id
    ? await prisma.practiceMember.findMany({
        where: {
          practiceId: practice.id,
          isActive: true,
          role: { in: ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN"] },
        },
        include: {
          user: {
            select: {
              phone: true,
              doctor: { select: { contactNumbers: true } },
            },
          },
        },
      })
    : [];

  for (const m of practiceMembers) {
    if (phoneMatches(m.user.phone, digits)) return true;
    const nums = Array.isArray(m.user.doctor?.contactNumbers)
      ? m.user.doctor!.contactNumbers
      : [];
    for (const n of nums) {
      if (phoneMatches(String(n), digits)) return true;
    }
  }

  return false;
}

export const WhatsAppService = {
  async resolvePracticeByNumber(businessNumber: string, wabaPhoneNumberId?: string) {
    const practice = await NumberPoolService.findPracticeByWhatsAppTo(
      businessNumber,
      wabaPhoneNumberId,
    );
    if (!practice) return null;
    // Re-fetch with WhatsApp include shape expected by orchestrator
    return prisma.practice.findFirst({
      where: { id: practice.id, isActive: true },
      include: {
        locations: { where: { isActive: true }, take: 5 },
        members: {
          where: { isActive: true, role: { in: ["DOCTOR", "PRACTICE_OWNER"] } },
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
      },
    });
  },

  async getOrCreateConversation(practiceId: string, patientPhone: string) {
    const phone = normalizePhone(patientPhone);
    return prisma.whatsAppConversation.upsert({
      where: { practiceId_patientPhone: { practiceId, patientPhone: phone } },
      create: { practiceId, patientPhone: phone, state: {} },
      update: {},
    });
  },

  async processMetaWebhook(body: unknown): Promise<void> {
    const payload = body as {
      entry?: Array<{ changes?: Array<{ field?: string }> }>;
    };
    const hasTemplateUpdate = (payload.entry ?? []).some((e) =>
      (e.changes ?? []).some((c) => c.field === "message_template_status_update"),
    );
    if (hasTemplateUpdate) {
      const { MetaWhatsAppProvisionService } = await import(
        "./metaWhatsApp.provision.js"
      );
      await MetaWhatsAppProvisionService.handleTemplateStatusWebhook(body);
    }

    const inbound = extractMetaMessages(body);

    for (const item of inbound) {
      let text = "";
      let messageType: "text" | "audio" | "image" = "text";
      let transcribedText: string | undefined;
      let idScan: IdScanFields | undefined;

      const buttonOrInteractive =
        item.message.type === "button" ||
        item.message.type === "interactive" ||
        Boolean(item.message.button) ||
        Boolean(item.message.interactive);

      if (item.message.type === "text" && item.message.text?.body) {
        text = item.message.text.body;
      } else if (buttonOrInteractive) {
        text = extractInboundText(item.message);
        if (!text) {
          console.warn(
            `[WhatsApp] empty button/interactive payload type=${item.message.type} from=${item.from}`,
          );
          continue;
        }
        console.log(
          `[WhatsApp] button/interactive from=${item.from} → "${text.slice(0, 80)}"`,
        );
      } else if (
        item.message.type === "audio" ||
        item.message.type === "voice"
      ) {
        messageType = "audio";
        const mediaId =
          item.message.audio?.id || item.message.voice?.id || "";
        if (!mediaId) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.voiceFailed(),
            item.phoneNumberId,
          );
          continue;
        }

        // Acknowledge quickly so the patient knows we heard them
        if (isSttConfigured()) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.voiceProcessing(),
            item.phoneNumberId,
          );
        }

        const media = await downloadWhatsAppMedia(mediaId);
        if (media) {
          transcribedText =
            (await transcribeAudio(media.buffer, media.mimeType)) ?? undefined;
        }
        text = transcribedText ?? "";
        if (transcribedText) {
          console.log(
            `[WhatsApp STT] from=${item.from} → "${transcribedText.slice(0, 120)}"`,
          );
        }
      } else if (
        item.message.type === "image" ||
        item.message.type === "document"
      ) {
        messageType = "image";
        const mediaId =
          item.message.image?.id || item.message.document?.id || "";
        const caption =
          item.message.image?.caption ||
          item.message.document?.caption ||
          "";
        const filename =
          item.message.document?.filename ||
          item.message.document?.caption ||
          caption ||
          "";
        text = caption.trim();

        if (!mediaId) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.visitDocBadType(),
            item.phoneNumberId,
          );
          continue;
        }

        // Resolve practice + conversation early so we can choose ID-OCR vs visit-doc.
        const practiceEarly = await this.resolvePracticeByNumber(
          item.to,
          item.phoneNumberId,
        );
        if (!practiceEarly) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.practiceNotLinked(),
            item.phoneNumberId,
          );
          continue;
        }
        const patientPhoneEarly = normalizePhone(item.from);
        const convEarly = await this.getOrCreateConversation(
          practiceEarly.id,
          patientPhoneEarly,
        );
        const earlyState = (convEarly.state as ConversationState) ?? {};
        const langEarly = resolveLang(earlyState.preferredLanguage);

        const {
          attachWhatsAppVisitDocument,
          inActiveRegisterStep,
          isIdRegistrationCaption,
          isVisitDocumentMime,
        } = await import("./whatsapp.visitDocs.js");

        const media = await downloadWhatsAppMedia(mediaId);
        if (!media) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.visitDocUploadFailed(langEarly),
            item.phoneNumberId,
          );
          continue;
        }

        // Already registered → never ask for / run Aadhaar–PAN OCR again.
        const alreadyRegistered = await PatientService.findByPhone(
          patientPhoneEarly,
        );
        const activelyRegistering = inActiveRegisterStep(earlyState.step);

        const preferIdOcr =
          !alreadyRegistered &&
          (activelyRegistering || isIdRegistrationCaption(caption));

        // Visit report path: PDF always; images when not registering / ID caption.
        const tryVisitDoc =
          isVisitDocumentMime(media.mimeType) &&
          !preferIdOcr &&
          (media.mimeType.toLowerCase().includes("pdf") ||
            !activelyRegistering);

        if (tryVisitDoc) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.visitDocProcessing(langEarly),
            item.phoneNumberId,
          );
          const attached = await attachWhatsAppVisitDocument({
            practiceId: practiceEarly.id,
            patientPhone: patientPhoneEarly,
            buffer: media.buffer,
            mimeType: media.mimeType,
            filename: filename || undefined,
            caption: caption || undefined,
            lang: langEarly,
          });

          if (attached.attached) {
            await sendWhatsAppText(
              item.from,
              attached.reply,
              item.phoneNumberId,
            );
            continue;
          }

          const midBookingFlow =
            Boolean(earlyState.step) &&
            earlyState.step !== "idle" &&
            !activelyRegistering;
          if (midBookingFlow) {
            await sendWhatsAppText(
              item.from,
              BotPrompts.idPhotoWrongStep(langEarly),
              item.phoneNumberId,
            );
            continue;
          }

          // Registered patient with no open booking: do not fall through to ID OCR.
          if (alreadyRegistered) {
            await sendWhatsAppText(
              item.from,
              attached.reply ||
                BotPrompts.alreadyRegistered(
                  alreadyRegistered.name || "",
                  langEarly,
                ),
              item.phoneNumberId,
            );
            continue;
          }

          // Idle + OCR-able photo + no open booking → try registration ID scan.
          const canFallThroughOcr =
            !media.mimeType.toLowerCase().includes("pdf") &&
            isOcrableImageMime(media.mimeType) &&
            (!earlyState.step || earlyState.step === "idle") &&
            isIdOcrConfigured();
          if (!canFallThroughOcr) {
            await sendWhatsAppText(
              item.from,
              attached.reply,
              item.phoneNumberId,
            );
            continue;
          }
        }

        // Registered numbers never enter ID OCR (even with "aadhaar" caption).
        if (alreadyRegistered && !activelyRegistering) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.alreadyRegistered(
              alreadyRegistered.name || "",
              langEarly,
            ),
            item.phoneNumberId,
          );
          continue;
        }

        // ID OCR (registration autofill)
        if (!isIdOcrConfigured()) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.idOcrNotConfigured(langEarly),
            item.phoneNumberId,
          );
          continue;
        }

        if (!isOcrableImageMime(media.mimeType)) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.visitDocBadType(langEarly),
            item.phoneNumberId,
          );
          continue;
        }

        await sendWhatsAppText(
          item.from,
          BotPrompts.idOcrProcessing(langEarly),
          item.phoneNumberId,
        );

        try {
          idScan = await IdScanService.extractFromBase64({
            imageBase64: media.buffer.toString("base64"),
            mimeType: media.mimeType,
          });
          console.log(
            `[WhatsApp OCR] from=${item.from} type=${idScan.documentType ?? "?"} name=${idScan.name ?? "—"}`,
          );
        } catch (err) {
          console.warn("[WhatsApp OCR]", err);
          await sendWhatsAppText(
            item.from,
            BotPrompts.idOcrFailed(langEarly),
            item.phoneNumberId,
          );
          continue;
        }
      } else {
        // Unsupported media (video/sticker) — nudge to text/voice/ID photo
        if (["video", "sticker"].includes(item.message.type)) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.unsupportedMedia(),
            item.phoneNumberId,
          );
        }
        continue;
      }

      const result = await this.handleInboundMessage({
        from: item.from,
        to: item.to,
        phoneNumberId: item.phoneNumberId,
        body: text,
        messageType,
        transcribedText,
        idScan,
      });

      const sent = await sendWhatsAppText(item.from, result.reply, item.phoneNumberId);
      if (!sent.ok) {
        console.error(
          `[WhatsApp] send failed to=${item.from} phoneId=${item.phoneNumberId ?? "?"} err=${sent.error}`,
        );
        // One retry — Meta/test lines occasionally drop the first Graph call
        const retry = await sendWhatsAppText(item.from, result.reply, item.phoneNumberId);
        if (!retry.ok) {
          console.error(`[WhatsApp] send retry failed: ${retry.error}`);
        }
      } else if (sent.simulated) {
        console.warn(
          `[WhatsApp] SIMULATED send (missing token/phoneId) to=${item.from} — patient will not see reply`,
        );
      }
    }
  },

  async handleInboundMessage(payload: {
    from: string;
    to: string;
    phoneNumberId?: string;
    body: string;
    messageType?: "text" | "audio" | "image";
    transcribedText?: string;
    idScan?: IdScanFields;
  }): Promise<{ reply: string }> {
    const practice = await this.resolvePracticeByNumber(
      payload.to,
      payload.phoneNumberId,
    );
    if (!practice) {
      return { reply: BotPrompts.practiceNotLinked() };
    }

    const patientPhone = normalizePhone(payload.from);

    // Load conversation early so voice/ID acks can use preferred language.
    const convEarly = await this.getOrCreateConversation(
      practice.id,
      patientPhone,
    );
    const earlyState = (convEarly.state as ConversationState) ?? {};
    const lang = resolveLang(earlyState.preferredLanguage);

    if (payload.messageType === "audio" && !payload.transcribedText) {
      return {
        reply: isSttConfigured()
          ? BotPrompts.voiceFailed(lang)
          : BotPrompts.voiceSttNotConfigured(lang),
      };
    }

    if (payload.messageType === "image" && !payload.idScan) {
      return { reply: BotPrompts.idOcrFailed(lang) };
    }

    const text =
      payload.messageType === "audio" && payload.transcribedText
        ? payload.transcribedText
        : payload.body;

    const { getPracticeEntitlement, hasFeatureFlag } = await import(
      "./planEntitlements.js"
    );

    const [isStaff, ent] = await Promise.all([
      isStaffOrClinicPhone(patientPhone, practice),
      getPracticeEntitlement(practice.id),
    ]);
    const conv = convEarly;

    if (isStaff) {
      return { reply: BotPrompts.patientsOnly(lang) };
    }

    if (
      !ent.usable ||
      !hasFeatureFlag(ent.features, "whatsappLine") ||
      ent.status === PracticeSubscriptionStatus.SUSPENDED ||
      ent.status === PracticeSubscriptionStatus.CANCELLED
    ) {
      return {
        reply:
          "This clinic's WhatsApp booking line is temporarily unavailable. Please book on the website or call the clinic directly.",
      };
    }

    const state = (conv.state as ConversationState) ?? {};
    if (conv.status === "handed_off" && !state.handedOff) {
      state.handedOff = true;
    }

    // Mirror patient WhatsApp text into care chat (portal + apps).
    // When the doctor already owns the thread, skip the booking bot.
    try {
      const { ingestWhatsAppPatientReply } = await import(
        "../chat.whatsappInbound.js"
      );
      const care = await ingestWhatsAppPatientReply({
        practiceId: practice.id,
        patientPhone,
        text,
        conversationAlreadyHandedOff:
          conv.status === "handed_off" || state.handedOff === true,
      });
      if (care.shouldDeferToHuman) {
        if (!state.handedOff) {
          state.handedOff = true;
          await prisma.whatsAppConversation.update({
            where: { id: conv.id },
            data: { status: "handed_off", state },
          });
        }
        return { reply: BotPrompts.careReplyReceived(lang) };
      }
    } catch (err) {
      console.warn(
        "[care-chat-wa] inbound ingest failed:",
        err instanceof Error ? err.message : err,
      );
    }

    return runOrchestrator({
      practice,
      patientPhone,
      convId: conv.id,
      state,
      text,
      idScan: payload.idScan,
    });
  },

  verifyWebhook(secret: string | undefined, provided?: string): boolean {
    if (!secret) return true;
    return secret === provided;
  },
};
