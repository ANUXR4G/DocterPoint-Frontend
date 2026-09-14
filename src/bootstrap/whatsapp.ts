/**
 * Ensure WhatsApp DB primitives exist so bot / notifications / admin UI work.
 * Safe to call on every API boot (idempotent).
 *
 * IMPORTANT: Do NOT stamp WHATSAPP_PHONE_NUMBER_ID onto every LIVE row.
 * That collapses multi-clinic routing onto one Meta line.
 */
import { prisma } from "../db/prisma.js";

export async function ensureWhatsAppInfrastructure(): Promise<void> {
  try {
    const { NumberPoolService } = await import(
      "../services/procto/numberPool.service.js"
    );

    const { META_UTILITY_TEMPLATES } = await import(
      "../services/procto/whatsapp.metaTemplates.js"
    );
    const platformTemplates = await prisma.messageTemplate.count({
      where: { practiceId: null },
    });
    const needsCatalogSync = platformTemplates < META_UTILITY_TEMPLATES.length;
    if (needsCatalogSync) {
      const synced = await NumberPoolService.syncMetaUtilityTemplates();
      console.log(
        `[whatsapp] synced ${synced.length} platform UTILITY message_templates ` +
          `(had ${platformTemplates}, catalog ${META_UTILITY_TEMPLATES.length})`,
      );
    }

    // Repair: shared Meta Phone Number IDs make every clinic look like one line.
    // Keep the oldest row; clear duplicates so webhook routing can use phoneNumber.
    const withMeta = await prisma.whatsAppNumber.findMany({
      where: {
        AND: [
          { wabaPhoneNumberId: { not: null } },
          { NOT: { wabaPhoneNumberId: "" } },
        ],
      },
      select: {
        id: true,
        phoneNumber: true,
        practiceId: true,
        wabaPhoneNumberId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const byMeta = new Map<string, typeof withMeta>();
    for (const row of withMeta) {
      const key = String(row.wabaPhoneNumberId).trim();
      if (!key) continue;
      const list = byMeta.get(key) ?? [];
      list.push(row);
      byMeta.set(key, list);
    }
    for (const [metaId, list] of byMeta) {
      if (list.length < 2) continue;
      const keep = list[0]!;
      for (const dupe of list.slice(1)) {
        await prisma.whatsAppNumber.update({
          where: { id: dupe.id },
          data: { wabaPhoneNumberId: null },
        });
        console.warn(
          `[whatsapp] cleared duplicate Meta phone id on ${dupe.phoneNumber} ` +
            `(shared ${metaId}; kept on ${keep.phoneNumber}). ` +
            `Re-connect this clinic with its own Meta Phone Number ID.`,
        );
      }
    }

    // Keep practice.whatsappBusinessNumber + practice.phone in sync with LIVE lines.
    const linked = await prisma.whatsAppNumber.findMany({
      where: {
        practiceId: { not: null },
        status: {
          in: [
            "LIVE",
            "TEMPLATES_PENDING",
            "DISPLAY_NAME_PENDING",
            "VERIFYING",
            "ASSIGNED",
          ],
        },
      },
      select: {
        phoneNumber: true,
        practiceId: true,
        practice: { select: { whatsappBusinessNumber: true, phone: true } },
      },
      take: 200,
    });
    for (const row of linked) {
      if (!row.practiceId) continue;
      const waDigits = (row.practice?.whatsappBusinessNumber ?? "")
        .replace(/\D/g, "")
        .slice(-10);
      const telDigits = (row.practice?.phone ?? "").replace(/\D/g, "").slice(-10);
      if (waDigits !== row.phoneNumber || telDigits !== row.phoneNumber) {
        await prisma.practice.update({
          where: { id: row.practiceId },
          data: {
            whatsappBusinessNumber: row.phoneNumber,
            phone: row.phoneNumber,
          },
        });
        console.log(
          `[whatsapp] synced practice phone + whatsappBusinessNumber → ${row.phoneNumber}`,
        );
      }
    }

    // Clear orphan WA display when no active pool row remains.
    const practicesWithWa = await prisma.practice.findMany({
      where: { whatsappBusinessNumber: { not: null } },
      select: {
        id: true,
        whatsappBusinessNumber: true,
        whatsappNumber: { select: { id: true, status: true, phoneNumber: true } },
      },
      take: 200,
    });
    for (const p of practicesWithWa) {
      const active =
        p.whatsappNumber &&
        ["LIVE", "TEMPLATES_PENDING", "DISPLAY_NAME_PENDING", "VERIFYING", "ASSIGNED", "SUSPENDED"].includes(
          p.whatsappNumber.status,
        );
      if (!active) {
        await prisma.practice.update({
          where: { id: p.id },
          data: { whatsappBusinessNumber: null },
        });
        console.log(
          `[whatsapp] cleared orphan whatsappBusinessNumber for practice ${p.id}`,
        );
      }
    }
  } catch (err) {
    console.warn(
      "[whatsapp] ensureWhatsAppInfrastructure failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
