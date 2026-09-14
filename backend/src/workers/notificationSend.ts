/**
 * Shared WhatsApp notification send path used by BullMQ worker and inline fallback.
 */
import { prisma } from "../db/prisma.js";
import { sendNotificationWhatsApp } from "../services/procto/whatsapp.client.js";

export async function processNotificationEvent(notificationId: string): Promise<{
  skipped?: boolean;
  reason?: string;
  sent?: boolean;
  simulated?: boolean;
  usedTemplate?: boolean;
  to?: string;
}> {
  const event = await prisma.notificationEvent.findUnique({
    where: { id: notificationId },
    include: { practice: true, booking: true },
  });

  if (!event || event.status !== "PENDING") {
    return { skipped: true };
  }

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const to = String(payload.to ?? event.booking.patientPhone);
  const templateKey = String(
    payload.templateKey ?? event.type ?? "BOOKING_CONFIRMATION",
  );
  const recipientRole = String(payload.recipientRole ?? "patient");

  if (recipientRole !== "clinic") {
    const conv = await prisma.whatsAppConversation.findFirst({
      where: {
        practiceId: event.practiceId,
        patientPhone: { endsWith: to.replace(/\D/g, "").slice(-10) },
      },
      orderBy: { updatedAt: "desc" },
    });
    const state = (conv?.state ?? {}) as { waOptOut?: boolean };
    if (state.waOptOut) {
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          payload: { ...payload, error: "patient opted out (STOP)" },
        },
      });
      return { skipped: true, reason: "opt_out" };
    }
  }

  const waNumber = await prisma.whatsAppNumber.findFirst({
    where: {
      practiceId: event.practiceId,
      status: { in: ["LIVE", "TEMPLATES_PENDING", "DISPLAY_NAME_PENDING"] },
    },
    select: { wabaPhoneNumberId: true, templatesStatus: true },
  });

  if (
    waNumber?.templatesStatus &&
    !["approved", "partial"].includes(waNumber.templatesStatus) &&
    recipientRole !== "clinic"
  ) {
    console.log(
      `[notification] templates not approved for practice ${event.practiceId} — attempting send anyway`,
    );
  }

  const result = await sendNotificationWhatsApp(
    to,
    templateKey,
    payload,
    waNumber?.wabaPhoneNumberId ?? undefined,
  );

  // Meta test / unverified display names reject both template and free-form
  // (#131037). Record as SKIPPED so the queue drains; ops must approve display name.
  const errMsg = result.error ?? "";
  const metaDisplayBlocked =
    !result.ok &&
    !result.simulated &&
    (/131037/.test(errMsg) || /display name/i.test(errMsg));

  if (metaDisplayBlocked) {
    await prisma.notificationEvent.update({
      where: { id: event.id },
      data: {
        status: "SKIPPED",
        sentAt: new Date(),
        payload: {
          ...payload,
          error: errMsg,
          metaBlocked: "display_name_approval",
        },
      },
    });
    console.warn(
      `[notification] Meta display name not approved — skipped ${event.id} (${templateKey})`,
    );
    return { skipped: true, reason: "meta_display_name", to };
  }

  if (!result.ok && !result.simulated) {
    await prisma.notificationEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", payload: { ...payload, error: result.error } },
    });
    throw new Error(result.error ?? "WhatsApp send failed");
  }

  await prisma.notificationEvent.update({
    where: { id: event.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      payload: {
        ...payload,
        usedTemplate: result.usedTemplate ?? false,
        simulated: result.simulated ?? false,
      },
    },
  });

  return {
    sent: true,
    simulated: result.simulated ?? false,
    usedTemplate: result.usedTemplate ?? false,
    to,
  };
}
