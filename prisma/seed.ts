import bcrypt from "bcrypt";
import { PrismaClient, ScheduleMode } from "@prisma/client";

const prisma = new PrismaClient();

/** Shared demo password for doctor + patient (+ admin). */
const DEMO_PASSWORD = "Demo@12345";

/**
 * Minimal demo: exactly one clinic, one doctor, one patient.
 * Doctor owns the clinic (CLINIC) — use /login/doctor or /login/clinic with the same account.
 */
async function main() {
  console.log("Seeding minimal GlucoGuide demo (1 clinic · 1 doctor · 1 patient)…");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Wipe prior demo data so the DB stays minimal
  await wipeAllAppData();

  const hospital = await prisma.hospital.create({
    data: {
      name: "City Diabetes Center",
      address: "Road 11, Gulshan-2",
      city: "Gulshan",
      imgSrc: "https://images.pexels.com/photos/263402/pexels-photo-263402.jpeg",
      description: "Multi-specialty diabetes and endocrine care center.",
      emails: ["contact@citydiabetes.in"],
      contactNumbers: ["+918012345678"],
      geometry: { type: "Point", coordinates: [90.4175, 23.7925] },
    },
  });

  const doctorUser = await prisma.user.create({
    data: {
      email: "dr.demo@glucoguide.com",
      password: passwordHash,
      role: "doctor",
      name: "Dr. Ananya Sharma",
      phone: "9876543210",
      doctor: {
        create: {
          description:
            "Endocrinologist specializing in Type 1 & Type 2 diabetes management.",
          hospitalId: hospital.id,
          availableTimes: "Mon–Sat 9:00–17:00",
          experience: 12,
          emails: ["dr.demo@glucoguide.com"],
          contactNumbers: ["+919876543210"],
          appointmentValidityDays: 7,
        },
      },
    },
    include: { doctor: true },
  });

  const practice = await prisma.practice.create({
    data: {
      name: "Dr. Ananya Sharma Clinic",
      slug: "dr-ananya-sharma-clinic",
      type: "CLINIC",
      specialty: "Endocrinology & Diabetes",
      consultationFee: 800,
      phone: "9876543210",
      email: "dr.demo@glucoguide.com",
      whatsappBusinessNumber: "+919876543210",
      whatsappWebhookSecret: "demo-webhook-secret",
      isActive: true,
      isDirectoryListed: true,
      locations: {
        create: {
          name: "Main Clinic",
          address: "Road 11, Gulshan-2",
          city: "Gulshan",
          businessHours: {
            mon: "09:00-17:00",
            tue: "09:00-17:00",
            wed: "09:00-17:00",
            thu: "09:00-17:00",
            fri: "09:00-17:00",
            sat: "09:00-13:00",
          },
        },
      },
      members: {
        create: {
          userId: doctorUser.id,
          role: "PRACTICE_OWNER",
          doctorId: doctorUser.id,
        },
      },
    },
    include: { locations: true },
  });

  const location = practice.locations[0]!;

  const scheduleDays = [
    {
      dayOfWeek: 1,
      mode: ScheduleMode.TIME_BASED,
      slotIntervalMin: 30,
      startTime: "09:00",
      endTime: "12:00",
      maxPerSlot: 2,
    },
    {
      dayOfWeek: 2,
      mode: ScheduleMode.TIME_BASED,
      slotIntervalMin: 30,
      startTime: "09:00",
      endTime: "12:00",
      maxPerSlot: 2,
    },
    {
      dayOfWeek: 3,
      mode: ScheduleMode.TIME_BASED,
      slotIntervalMin: 15,
      startTime: "14:00",
      endTime: "17:00",
      maxPerSlot: 1,
    },
    {
      dayOfWeek: 4,
      mode: ScheduleMode.TIME_BASED,
      slotIntervalMin: 30,
      startTime: "09:00",
      endTime: "12:00",
      maxPerSlot: 2,
    },
    {
      dayOfWeek: 5,
      mode: ScheduleMode.TIME_BASED,
      slotIntervalMin: 30,
      startTime: "09:00",
      endTime: "12:00",
      maxPerSlot: 2,
    },
    {
      dayOfWeek: 6,
      mode: ScheduleMode.TIME_BASED,
      slotIntervalMin: 30,
      startTime: "09:00",
      endTime: "13:00",
      maxPerSlot: 2,
    },
  ] as const;

  for (const day of scheduleDays) {
    await prisma.providerSchedule.create({
      data: {
        practiceId: practice.id,
        locationId: location.id,
        providerId: doctorUser.id,
        ...day,
        isActive: true,
      },
    });
  }

  const patientUser = await prisma.user.create({
    data: {
      email: "patient1@example.com",
      password: passwordHash,
      role: "user",
      name: "Ravi Kumar",
      phone: "9999973601",
      gender: "male",
      address: "Koramangala, Bangalore",
      patient: {
        create: {
          profession: "Software Engineer",
          dateOfBirth: "03/15/1988",
          contactNumber: "9999973601",
          emergencyNumber: "9123456790",
        },
      },
    },
    include: { patient: true },
  });

  // One sample booking so queue / patient list are not empty
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  await prisma.practiceBooking.create({
    data: {
      practiceId: practice.id,
      locationId: location.id,
      providerId: doctorUser.id,
      patientId: patientUser.patient!.id,
      patientPhone: "9999973601",
      patientName: "Ravi Kumar",
      mode: ScheduleMode.TIME_BASED,
      status: "SCHEDULED",
      channel: "WEB_PORTAL",
      slotStart: tomorrow,
      slotEnd: new Date(tomorrow.getTime() + 30 * 60_000),
    },
  });

  await prisma.user.create({
    data: {
      email: "admin@glucoguide.com",
      password: passwordHash,
      role: "admin",
      name: "GlucoGuide Admin",
      phone: "9000000000",
    },
  });

  const { NumberPoolService } = await import(
    "../src/services/procto/numberPool.service.js"
  );
  const plans = await NumberPoolService.ensureDefaultPlans();
  const clinicPlan = plans.find((p) => p.name === "Clinic")!;

  await prisma.practiceSubscription.create({
    data: {
      practiceId: practice.id,
      planId: clinicPlan.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      notes: "Demo clinic — Clinic plan (live analytics + full features)",
    },
  });

  await prisma.whatsAppNumber.create({
    data: {
      phoneNumber: "9876543210",
      displayName: practice.name,
      status: "LIVE",
      provider: process.env.WHATSAPP_PHONE_NUMBER_ID ? "META_CLOUD_API" : "MOCK",
      practiceId: practice.id,
      wabaPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      wabaId: process.env.WHATSAPP_WABA_ID || null,
      verificationStatus: "verified",
      displayNameStatus: "approved",
      templatesStatus: "approved",
      activatedAt: new Date(),
      notes: "Minimal demo WhatsApp line",
    },
  });

  await prisma.practice.update({
    where: { id: practice.id },
    data: { whatsappBusinessNumber: "9876543210" },
  });

  await NumberPoolService.syncMetaUtilityTemplates();

  console.log("\n✅ Minimal seed complete\n");
  console.log("  Clinic:   Dr. Ananya Sharma Clinic  (/practices/dr-ananya-sharma-clinic)");
  console.log("  Doctor:   dr.demo@glucoguide.com");
  console.log("  Patient:  patient1@example.com");
  console.log("  Admin:    admin@glucoguide.com");
  console.log(`  Password: ${DEMO_PASSWORD}  (all of the above)\n`);
}

/** Delete application rows so re-seed leaves only the minimal set. */
async function wipeAllAppData() {
  // Child → parent order (cascade covers many, but be explicit for safety)
  await prisma.notificationEvent.deleteMany();
  await prisma.practiceReview.deleteMany();
  await prisma.messageTemplate.deleteMany();
  await prisma.whatsAppConversation.deleteMany();
  await prisma.practiceBooking.deleteMany();
  await prisma.scheduleOverride.deleteMany();
  await prisma.providerSchedule.deleteMany();
  await prisma.practiceSubscription.deleteMany();
  await prisma.practiceMember.deleteMany();
  await prisma.clinicLocation.deleteMany();
  await prisma.whatsAppNumber.deleteMany();
  await prisma.practice.deleteMany();
  await prisma.docLinePlan.deleteMany();

  await prisma.medication.deleteMany().catch(() => undefined);
  await prisma.appointment.deleteMany().catch(() => undefined);
  await prisma.healthRecord.deleteMany().catch(() => undefined);
  await prisma.message.deleteMany().catch(() => undefined);

  await prisma.patient.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.meal.deleteMany().catch(() => undefined);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
