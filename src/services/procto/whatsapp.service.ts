import { prisma } from "../../db/prisma.js";
import {
  downloadWhatsAppMedia,
  isSttConfigured,
  sendWhatsAppDocument,
  sendWhatsAppInteractiveButtons,
  sendWhatsAppInteractiveList,
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
import { settings, publicWebOrigin } from "../../config/index.js";
import {
  getPracticeEntitlement,
  hasFeatureFlag,
} from "./planEntitlements.js";
import {
  ingestWhatsAppPatientReply,
  looksLikeBotCommand,
} from "../chat.whatsappInbound.js";

/** Short TTL caches — WhatsApp traffic is bursty; avoid repeat DB on every tap. */
const PRACTICE_RESOLVE_TTL_MS = 60_000;
const STAFF_CHECK_TTL_MS = 60_000;
const ENTITLEMENT_TTL_MS = 30_000;

const practiceResolveCache = new Map<
  string,
  {
    at: number;
    practice: Awaited<
      ReturnType<typeof NumberPoolService.findPracticeByWhatsAppTo>
    >;
  }
>();
const staffCheckCache = new Map<string, { at: number; isStaff: boolean }>();
const entitlementCache = new Map<
  string,
  { at: number; ent: Awaited<ReturnType<typeof getPracticeEntitlement>> }
>();

function fresh<T extends { at: number }>(hit: T | undefined, ttl: number): T | null {
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) return null;
  return hit;
}

function isIdOcrConfigured(): boolean {
  return Boolean(settings.openaiApiKey || settings.hfToken);
}

/** ID registration OCR — photos or PDF (rasterized in IdScanService). */
function isOcrableIdMime(
  mime: string,
  filename?: string,
  bytes?: Buffer,
): boolean {
  const m = mime.toLowerCase();
  if (
    m.includes("jpeg") ||
    m.includes("jpg") ||
    m.includes("png") ||
    m.includes("webp") ||
    m.includes("pdf")
  ) {
    return true;
  }
  // WhatsApp sometimes sends PDF as application/octet-stream
  if (filename && /\.pdf$/i.test(filename)) return true;
  if (bytes && bytes.length >= 5) {
    const head = bytes.subarray(0, 1024).toString("latin1");
    if (/%PDF-/i.test(head)) return true;
  }
  return false;
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

/** Prefer structured interactive ids over display titles. */
export function preferInteractiveId(id?: string, title?: string): string {
  const trimmedId = id?.trim() || "";
  // Meta sends both id + title; titles like "Cancel" must NOT replace ids
  // like "confirm:cancel" (global Exit hijack would kill the booking flow).
  if (
    trimmedId &&
    (/^[a-z][a-z0-9_]*:/i.test(trimmedId) ||
      trimmedId.startsWith("reg_email_") ||
      /^(yes|no)$/i.test(trimmedId))
  ) {
    return trimmedId;
  }
  return (title || id || "").trim();
}

/** Normalize inbound WhatsApp text from plain text, buttons, or list picks. */
function extractInboundText(message: MetaMessage): string {
  if (message.type === "text" && message.text?.body) {
    return message.text.body.trim();
  }
  if (message.type === "button") {
    return (
      message.button?.payload?.trim() ||
      message.button?.text?.trim() ||
      ""
    );
  }
  if (message.type === "interactive") {
    const btn = message.interactive?.button_reply;
    if (btn?.title?.trim() || btn?.id?.trim()) {
      return preferInteractiveId(btn.id, btn.title);
    }
    const list = message.interactive?.list_reply;
    if (list?.title?.trim() || list?.id?.trim()) {
      return preferInteractiveId(list.id, list.title);
    }
  }
  // Some payloads omit type but still include button/interactive
  if (message.button?.text || message.button?.payload) {
    return (
      message.button.payload?.trim() ||
      message.button.text?.trim() ||
      ""
    );
  }
  if (message.interactive?.button_reply) {
    const btn = message.interactive.button_reply;
    return preferInteractiveId(btn.id, btn.title);
  }
  if (message.interactive?.list_reply) {
    const list = message.interactive.list_reply;
    return preferInteractiveId(list.id, list.title);
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
  const a = normalizePhone(stored);
  if (a === digits) return true;
  // Match across full MSISDN vs legacy last-10 storage
  if (a.length >= 10 && digits.length >= 10 && a.slice(-10) === digits.slice(-10)) {
    return true;
  }
  return false;
}

/** True if this phone belongs to a doctor, clinic owner/staff, or clinic business line. */
export async function isStaffOrClinicPhone(
  phone: string,
  practice: {
    id?: string;
    phone?: string | null;
    whatsappBusinessNumber?: string | null;
    members?: Array<{
      user?: {
        phone?: string | null;
        doctor?: { contactNumbers?: unknown } | null;
      } | null;
    }>;
  },
): Promise<boolean> {
  const digits = normalizePhone(phone);
  if (digits.length < 10) return false;
  const last10 = digits.slice(-10);
  const cacheKey = `${practice.id ?? ""}:${last10}`;
  const cached = fresh(staffCheckCache.get(cacheKey), STAFF_CHECK_TTL_MS);
  if (cached) return cached.isStaff;

  let isStaff = false;

  if (
    phoneMatches(practice.phone, digits) ||
    phoneMatches(practice.whatsappBusinessNumber, digits)
  ) {
    isStaff = true;
  }

  // Prefer already-loaded practice members (no extra DB).
  if (!isStaff && Array.isArray(practice.members) && practice.members.length) {
    for (const m of practice.members) {
      if (phoneMatches(m.user?.phone, digits)) {
        isStaff = true;
        break;
      }
      const nums = Array.isArray(m.user?.doctor?.contactNumbers)
        ? (m.user!.doctor!.contactNumbers as unknown[])
        : [];
      for (const n of nums) {
        if (phoneMatches(String(n), digits)) {
          isStaff = true;
          break;
        }
      }
      if (isStaff) break;
    }
  }

  if (!isStaff) {
    const [doctorUser, member] = await Promise.all([
      prisma.user.findFirst({
        where: {
          role: "doctor",
          OR: [{ phone: digits }, { phone: { endsWith: last10 } }],
        },
        select: { id: true },
      }),
      prisma.practiceMember.findFirst({
        where: {
          isActive: true,
          role: {
            in: ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN", "RECEPTIONIST"],
          },
          OR: [
            { user: { phone: digits } },
            { user: { phone: { endsWith: last10 } } },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (doctorUser || member) isStaff = true;
  }

  if (!isStaff && practice.id) {
    const practiceMembers = await prisma.practiceMember.findMany({
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
    });

    for (const m of practiceMembers) {
      if (phoneMatches(m.user.phone, digits)) {
        isStaff = true;
        break;
      }
      const nums = Array.isArray(m.user.doctor?.contactNumbers)
        ? m.user.doctor!.contactNumbers
        : [];
      for (const n of nums) {
        if (phoneMatches(String(n), digits)) {
          isStaff = true;
          break;
        }
      }
      if (isStaff) break;
    }
  }

  staffCheckCache.set(cacheKey, { at: Date.now(), isStaff });
  return isStaff;
}

export const WhatsAppService = {
  async resolvePracticeByNumber(businessNumber: string, wabaPhoneNumberId?: string) {
    const cacheKey = `${wabaPhoneNumberId || ""}:${businessNumber}`;
    const cached = fresh(practiceResolveCache.get(cacheKey), PRACTICE_RESOLVE_TTL_MS);
    if (cached) return cached.practice;

    const practice = await NumberPoolService.findPracticeByWhatsAppTo(
      businessNumber,
      wabaPhoneNumberId,
    );
    practiceResolveCache.set(cacheKey, { at: Date.now(), practice });
    // Pool/practice hit already includes locations + doctor members — skip 2nd query.
    return practice;
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

        if (!isSttConfigured()) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.voiceSttNotConfigured(),
            item.phoneNumberId,
          );
          continue;
        }

        const { isUnclearVoiceTranscript } = await import("./whatsapp.nlu.js");
        if (!transcribedText || isUnclearVoiceTranscript(transcribedText)) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.voiceUnclear(),
            item.phoneNumberId,
          );
          continue;
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
          receiveWhatsAppBranchFDocument,
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
        const awaitingDocUpload =
          earlyState.step === "awaiting_document_upload" ||
          earlyState.step === "awaiting_report";
        const reportCaption = /^(report|reports|document|attach|lab)/i.test(
          caption.trim(),
        );

        const preferIdOcr =
          !alreadyRegistered &&
          !awaitingDocUpload &&
          !reportCaption &&
          (activelyRegistering || isIdRegistrationCaption(caption));

        const looksLikeVisitFile = isVisitDocumentMime(media.mimeType, {
          filename,
          buffer: media.buffer,
        });

        // Branch F / visit report path
        const tryVisitDoc =
          looksLikeVisitFile &&
          !preferIdOcr &&
          (awaitingDocUpload ||
            reportCaption ||
            media.mimeType.toLowerCase().includes("pdf") ||
            /\.pdf$/i.test(filename) ||
            !activelyRegistering);

        if (tryVisitDoc) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.visitDocProcessing(langEarly),
            item.phoneNumberId,
          );

          // Branch F: Menu → Attach, post-booking Yes, or registered idle drop.
          // Always offer Select Appointment | General Document when visits exist
          // (never silent-attach to the only open booking). preferredBookingId
          // only when the patient already picked a visit this turn.
          const useBranchF =
            awaitingDocUpload ||
            reportCaption ||
            (Boolean(alreadyRegistered) && !activelyRegistering);

          if (useBranchF) {
            const branchF = await receiveWhatsAppBranchFDocument({
              practiceId: practiceEarly.id,
              patientPhone: patientPhoneEarly,
              buffer: media.buffer,
              mimeType: media.mimeType,
              filename: filename || undefined,
              caption: caption || undefined,
              lang: langEarly,
              preferredBookingId: awaitingDocUpload
                ? earlyState.lastBookingId || null
                : null,
            });

            if (branchF.nextStep === "awaiting_document_link" && branchF.pendingDoc) {
              await prisma.whatsAppConversation.update({
                where: { id: convEarly.id },
                data: {
                  status: "bot_active",
                  state: {
                    ...earlyState,
                    handedOff: false,
                    postBookingCare: false,
                    step: "awaiting_document_link",
                    pendingDoc: branchF.pendingDoc,
                    idleReminderSentAt: undefined,
                  },
                },
              });
              const btnSent = await sendWhatsAppInteractiveButtons(
                item.from,
                {
                  body: branchF.reply,
                  buttons: [
                    { id: "doc:appointment", title: "Select Appointment" },
                    { id: "doc:general", title: "General Document" },
                  ],
                },
                item.phoneNumberId,
              );
              if (!btnSent.ok) {
                await sendWhatsAppText(
                  item.from,
                  `${branchF.reply}\n\nReply *Select Appointment* or *General Document*.`,
                  item.phoneNumberId,
                );
              }
              continue;
            }

            await prisma.whatsAppConversation.update({
              where: { id: convEarly.id },
              data: {
                state: {
                  ...earlyState,
                  step: "idle",
                  pendingDoc: null,
                  lastBookingId:
                    branchF.bookingId || earlyState.lastBookingId,
                  idleReminderSentAt: undefined,
                },
              },
            });
            await sendWhatsAppText(
              item.from,
              branchF.reply,
              item.phoneNumberId,
            );
            continue;
          }

          const attached = await attachWhatsAppVisitDocument({
            practiceId: practiceEarly.id,
            patientPhone: patientPhoneEarly,
            buffer: media.buffer,
            mimeType: media.mimeType,
            filename: filename || undefined,
            caption: caption || undefined,
            lang: langEarly,
            preferredBookingId: earlyState.lastBookingId,
          });

          if (attached.attached) {
            await prisma.whatsAppConversation.update({
              where: { id: convEarly.id },
              data: {
                state: {
                  ...earlyState,
                  step: "idle",
                  lastBookingId: attached.bookingId || earlyState.lastBookingId,
                  pendingDoc: null,
                  idleReminderSentAt: undefined,
                },
              },
            });
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
            earlyState.step !== "awaiting_report" &&
            earlyState.step !== "awaiting_document_upload" &&
            !activelyRegistering;
          if (midBookingFlow) {
            await sendWhatsAppText(
              item.from,
              BotPrompts.idPhotoWrongStep(langEarly),
              item.phoneNumberId,
            );
            continue;
          }

          // Unregistered + no open booking: fall through to ID OCR when possible.
          const canFallThroughOcr =
            isOcrableIdMime(media.mimeType, filename, media.buffer) &&
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

        // Registered numbers never enter ID OCR (even with "aadhaar" caption),
        // unless they are mid-register for a family member.
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

        // ID OCR (registration autofill) — JPG/PNG/WEBP/PDF
        if (!isIdOcrConfigured()) {
          await sendWhatsAppText(
            item.from,
            BotPrompts.idOcrNotConfigured(langEarly),
            item.phoneNumberId,
          );
          continue;
        }

        if (!isOcrableIdMime(media.mimeType, filename, media.buffer)) {
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
          const looksPdf =
            /\.pdf$/i.test(filename) ||
            /pdf/i.test(media.mimeType) ||
            /%PDF-/i.test(media.buffer.subarray(0, 1024).toString("latin1"));
          idScan = await IdScanService.extractFromBase64({
            imageBase64: media.buffer.toString("base64"),
            mimeType: looksPdf
              ? "application/pdf"
              : media.mimeType.startsWith("image/")
                ? media.mimeType
                : "image/jpeg",
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
        fromInteractive: buttonOrInteractive,
      });

      // Clinic doctor pick: prefer tappable WhatsApp list (falls back to text).
      if (result.doctorList && result.doctorList.length > 1) {
        // Full text first so clinic page URLs are never truncated in list body
        if (
          result.textBeforeMenu ||
          /https?:\/\/|Clinic page|क्लिनिक पेज/i.test(result.reply)
        ) {
          const textSent = await sendWhatsAppText(
            item.from,
            result.reply,
            item.phoneNumberId,
          );
          if (!textSent.ok) {
            console.warn(
              `[WhatsApp] doctor list text failed: ${textSent.error}`,
            );
          }
        }
        const listSent = await sendWhatsAppInteractiveList(
          item.from,
          {
            header: "Choose a doctor",
            body:
              result.textBeforeMenu ||
              /https?:\/\/|Clinic page|क्लिनिक पेज/i.test(result.reply)
                ? "Select your doctor:"
                : result.reply.split("\n").slice(0, 3).join("\n").slice(0, 400) ||
                  "Select your doctor (with specialization):",
            buttonLabel: "Doctors",
            sectionTitle: "Available doctors",
            rows: result.doctorList.map((d, i) => ({
              id: `provider:${i + 1}`,
              title: d.name.replace(/^Dr\.?\s*/i, "Dr ").slice(0, 24),
              description: (
                d.specialty ||
                d.detail?.replace(/^Specialization:\s*/i, "") ||
                "General"
              ).slice(0, 72),
            })),
          },
          item.phoneNumberId,
        );
        if (listSent.ok && !listSent.simulated) {
          continue;
        }
        if (!listSent.ok) {
          console.warn(
            `[WhatsApp] doctor list interactive failed: ${listSent.error}`,
          );
        }
        // If full text already sent, don't duplicate
        if (
          result.textBeforeMenu ||
          /https?:\/\/|Clinic page|क्लिनिक पेज/i.test(result.reply)
        ) {
          continue;
        }
        // Simulated / Graph failure → send full text list so demos still work
      }

      // Welcome / HELP / post-booking — tappable Menu list
      if (result.menuList && result.menuList.length > 0) {
        const isPostBooking = result.menuList.some((row) =>
          row.id.startsWith("post:"),
        );
        const optionCount = result.menuList.length;
        const optionRange =
          optionCount <= 1 ? "1" : `1–${optionCount}`;
        // Language-switch acks must not be silent if the interactive list fails
        // or truncates — send the full text first, then the Menu list.
        // Do NOT force text+list for every "Main menu" (doubles Meta latency).
        const sendTextFirst =
          Boolean(result.textBeforeMenu) ||
          /Language set|भाषा \*|भाषा.*सेट/i.test(result.reply);
        if (sendTextFirst) {
          const textSent = await sendWhatsAppText(
            item.from,
            result.reply,
            item.phoneNumberId,
          );
          if (!textSent.ok) {
            console.warn(
              `[WhatsApp] menu text-first failed: ${textSent.error}`,
            );
          }
        }
        const listSent = await sendWhatsAppInteractiveList(
          item.from,
          {
            header: isPostBooking ? "Your booking" : "Main menu",
            body: sendTextFirst
              ? isPostBooking
                ? "What would you like to do?"
                : `Tap an option (${optionRange}):`
              : result.reply.split("\n").slice(0, 8).join("\n").slice(0, 400) ||
                (isPostBooking
                  ? "What would you like to do?"
                  : `Tap an option (${optionRange}):`),
            buttonLabel: "Menu",
            sectionTitle: isPostBooking
              ? "Choose one"
              : `${optionRange} Options`,
            rows: result.menuList.map((row) => ({
              id: row.id,
              title: row.title.slice(0, 24),
              description: row.description?.slice(0, 72),
            })),
          },
          item.phoneNumberId,
        );
        if (listSent.ok && !listSent.simulated) {
          continue;
        }
        if (!listSent.ok) {
          console.warn(
            `[WhatsApp] menu list interactive failed: ${listSent.error}`,
          );
        }
        // If language text already sent, don't fall through to duplicate text
        if (sendTextFirst) {
          continue;
        }
      }

      // Next 7 working days — interactive list (reply buttons only allow 3).
      if (result.dateList && result.dateList.length > 0) {
        const listSent = await sendWhatsAppInteractiveList(
          item.from,
          {
            header: "Choose a date",
            body:
              result.reply.split("\n").slice(0, 4).join("\n").slice(0, 400) ||
              "Pick a working day:",
            buttonLabel: "Dates",
            sectionTitle: "Next 7 working days",
            rows: result.dateList.map((d) => ({
              id: `date:${d.iso}`,
              title: d.label.slice(0, 24),
              description: d.iso,
            })),
          },
          item.phoneNumberId,
        );
        if (listSent.ok && !listSent.simulated) {
          continue;
        }
        if (!listSent.ok) {
          console.warn(
            `[WhatsApp] date list interactive failed: ${listSent.error}`,
          );
        }
      }

      // Time slots (4+): interactive list. ≤3 slots use replyButtons below.
      if (result.slotList && result.slotList.length > 0) {
        const listSent = await sendWhatsAppInteractiveList(
          item.from,
          {
            header: "Choose a time",
            body:
              result.reply.split("\n").slice(0, 4).join("\n").slice(0, 400) ||
              "Pick an available slot:",
            buttonLabel: "Slots",
            sectionTitle: "Open times",
            rows: result.slotList.map((s) => ({
              id: `slot:${s.index}`,
              title: s.label.slice(0, 24),
              description: `Option ${s.index}`,
            })),
          },
          item.phoneNumberId,
        );
        if (listSent.ok && !listSent.simulated) {
          continue;
        }
        if (!listSent.ok) {
          console.warn(
            `[WhatsApp] slot list interactive failed: ${listSent.error}`,
          );
        }
      }

      // Reschedule / cancel / message-doctor: pick which booking (list)
      if (result.bookingList && result.bookingList.length > 0) {
        const isCancel = /cancel|रद्द/i.test(result.reply);
        const isReport = /report|document|रिपोर्ट|दस्तावेज|attach/i.test(
          result.reply,
        );
        const listSent = await sendWhatsAppInteractiveList(
          item.from,
          {
            header: isCancel
              ? "Cancel booking"
              : isReport
                ? "Attach to visit"
                : "Choose a booking",
            body:
              result.reply.split("\n").slice(0, 4).join("\n").slice(0, 400) ||
              (isCancel
                ? "Tap a booking to cancel it"
                : isReport
                  ? "Which visit should get the file?"
                  : "Which appointment?"),
            buttonLabel: "Bookings",
            sectionTitle: "Your bookings",
            rows: result.bookingList.map((b) => ({
              id: `booking:${b.index}`,
              title: b.label.slice(0, 24),
              description: (b.description || `Booking ${b.index}`).slice(0, 72),
            })),
          },
          item.phoneNumberId,
        );
        if (listSent.ok && !listSent.simulated) {
          continue;
        }
        if (!listSent.ok) {
          console.warn(
            `[WhatsApp] booking list interactive failed: ${listSent.error}`,
          );
        }
      }

      // Department / specialty pick (Branch A)
      if (result.specialtyList && result.specialtyList.length > 0) {
        const listSent = await sendWhatsAppInteractiveList(
          item.from,
          {
            header: "Choose a department",
            body:
              result.reply.split("\n").slice(0, 4).join("\n").slice(0, 400) ||
              "Pick a specialty:",
            buttonLabel: "Departments",
            sectionTitle: "Available departments",
            rows: result.specialtyList.map((s) => ({
              id: `specialty:${s.index}`,
              title: s.label.slice(0, 24),
              description: (s.description || "Department").slice(0, 72),
            })),
          },
          item.phoneNumberId,
        );
        if (listSent.ok && !listSent.simulated) {
          continue;
        }
        if (!listSent.ok) {
          console.warn(
            `[WhatsApp] specialty list interactive failed: ${listSent.error}`,
          );
        }
      }

      // Who-to-book-for (yourself / family) when 4+ profiles
      if (result.patientList && result.patientList.length > 0) {
        const listSent = await sendWhatsAppInteractiveList(
          item.from,
          {
            header: "Who is booking?",
            body:
              result.reply.split("\n").slice(0, 4).join("\n").slice(0, 400) ||
              "Choose yourself or a family member",
            buttonLabel: "Profiles",
            sectionTitle: "Patient profiles",
            rows: result.patientList.map((p) => ({
              id: `patient:${p.index}`,
              title: p.label.slice(0, 24),
              description: (p.description || `Profile ${p.index}`).slice(0, 72),
            })),
          },
          item.phoneNumberId,
        );
        if (listSent.ok && !listSent.simulated) {
          continue;
        }
        if (!listSent.ok) {
          console.warn(
            `[WhatsApp] patient list interactive failed: ${listSent.error}`,
          );
        }
      }

      if (result.replyButtons && result.replyButtons.length > 0) {
        // Long confirmation + calendar links exceed Meta's 1024-char button body —
        // send full text first, then short Yes/No for attach / confirm chips.
        const longConfirm = Boolean(result.calendarInvite?.icsContent);
        if (longConfirm) {
          const textSent = await sendWhatsAppText(
            item.from,
            result.reply,
            item.phoneNumberId,
          );
          if (!textSent.ok) {
            console.warn(
              `[WhatsApp] confirm text-first failed: ${textSent.error}`,
            );
          }
        }
        const buttonBody = longConfirm
          ? result.reply.split(/\n\n/).slice(-1)[0]?.slice(0, 1024) ||
            "Would you like to send a report?"
          : result.reply.slice(0, 1024);
        const btnSent = await sendWhatsAppInteractiveButtons(
          item.from,
          {
            body: buttonBody,
            buttons: result.replyButtons,
          },
          item.phoneNumberId,
        );
        if (btnSent.ok && !btnSent.simulated) {
          if (result.calendarInvite?.icsContent) {
            const docSent = await sendWhatsAppDocument(
              item.from,
              {
                filename: result.calendarInvite.icsFilename || "appointment.ics",
                mimeType: "text/calendar",
                buffer: Buffer.from(result.calendarInvite.icsContent, "utf8"),
                caption: result.calendarInvite.caption,
              },
              item.phoneNumberId,
            );
            if (!docSent.ok) {
              console.warn(
                `[WhatsApp] calendar .ics document failed: ${docSent.error}`,
              );
            }
          }
          continue;
        }
        if (!btnSent.ok) {
          console.warn(
            `[WhatsApp] reply buttons interactive failed: ${btnSent.error}`,
          );
        }
        // Simulated / Graph failure → plain text with Yes/No instructions
      }

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

      if (result.calendarInvite?.icsContent) {
        const docSent = await sendWhatsAppDocument(
          item.from,
          {
            filename: result.calendarInvite.icsFilename || "appointment.ics",
            mimeType: "text/calendar",
            buffer: Buffer.from(result.calendarInvite.icsContent, "utf8"),
            caption: result.calendarInvite.caption,
          },
          item.phoneNumberId,
        );
        if (!docSent.ok) {
          console.warn(
            `[WhatsApp] calendar .ics document failed: ${docSent.error}`,
          );
        }
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
    /** List/button taps must never land in doctor care chat. */
    fromInteractive?: boolean;
  }): Promise<{
    reply: string;
    doctorList?: Array<{
      id: string;
      name: string;
      specialty?: string;
      detail?: string;
    }>;
    replyButtons?: Array<{ id: string; title: string }>;
    dateList?: Array<{ iso: string; label: string }>;
    slotList?: Array<{ index: number; label: string }>;
    bookingList?: Array<{ index: number; label: string; description?: string }>;
    patientList?: Array<{ index: number; label: string; description?: string }>;
    specialtyList?: Array<{ index: number; label: string; description?: string }>;
    menuList?: Array<{ id: string; title: string; description?: string }>;
    textBeforeMenu?: boolean;
    calendarInvite?: {
      icsFilename: string;
      icsContent: string;
      caption?: string;
    };
  }> {
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

    const entCached = fresh(
      entitlementCache.get(practice.id),
      ENTITLEMENT_TTL_MS,
    );
    const [isStaff, ent] = await Promise.all([
      isStaffOrClinicPhone(patientPhone, practice),
      entCached
        ? Promise.resolve(entCached.ent)
        : getPracticeEntitlement(practice.id, { skipBookingCount: true }).then(
            (e) => {
              entitlementCache.set(practice.id, { at: Date.now(), ent: e });
              return e;
            },
          ),
    ]);
    const conv = convEarly;

    if (isStaff) {
      return { reply: BotPrompts.patientsOnly(lang, publicWebOrigin()) };
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
    // Menu digits / BOOK / list taps skip this entirely (zero care-chat DB).
    // Branch E collects the message in the orchestrator (pins to booking / Admin).
    try {
      const branchECollecting =
        state.step === "awaiting_message_doctor_text" ||
        state.step === "awaiting_message_doctor_booking";
      if (
        !payload.fromInteractive &&
        !looksLikeBotCommand(text) &&
        !branchECollecting
      ) {
        const care = await ingestWhatsAppPatientReply({
          practiceId: practice.id,
          patientPhone,
          text,
          conversationAlreadyHandedOff:
            conv.status === "handed_off" || state.handedOff === true,
          postBookingCare: state.postBookingCare === true,
          preferredProviderId: state.careProviderId,
          preferredBookingId: state.careBookingId,
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
      fromVoice: payload.messageType === "audio",
    });
  },

  verifyWebhook(secret: string | undefined, provided?: string): boolean {
    if (!secret) return true;
    return secret === provided;
  },
};
