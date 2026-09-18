import bcrypt from "bcrypt";
import { PrismaClient, ScheduleMode } from "@prisma/client";

const prisma = new PrismaClient();

/** Shared demo password for doctor + patient (+ admin). */
const DEMO_PASSWORD = "Demo@12345";

/**
 * Demo: clinic owner + clinic staff doctor + independent solo doctor + patient.
 * Independent doctors are not linkable into clinics — clinic staff are created
 * from the clinic dashboard only.
 */
async function main() {
  console.log(
    "Seeding GlucoGuide demo (clinic owner + staff + independent doctor · 1 patient)…",
  );

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

  const clinicOwner = await prisma.user.create({
    data: {
      email: "dr.demo@glucoguide.com",
      password: passwordHash,
      role: "doctor",
      name: "Dr. Ananya Sharma",
      phone: "9876543210",
      createdBy: "clinic_owner_signup",
      doctor: {
        create: {
          description:
            "Endocrinology — Type 1 & Type 2 diabetes management.",
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

  const staffDoctor = await prisma.user.create({
    data: {
      email: "dr.staff@glucoguide.com",
      password: passwordHash,
      role: "doctor",
      name: "Dr. Kabir Mehta",
      phone: "9876543211",
      createdBy: "clinic_doctor_add",
      doctor: {
        create: {
          description: "Diabetology — general diabetes consultations.",
          hospitalId: hospital.id,
          availableTimes: "Mon–Sat 9:00–17:00",
          experience: 5,
          emails: ["dr.staff@glucoguide.com"],
          contactNumbers: ["+919876543211"],
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
        create: [
          {
            userId: clinicOwner.id,
            role: "PRACTICE_OWNER",
            doctorId: clinicOwner.id,
          },
          {
            userId: staffDoctor.id,
            role: "DOCTOR",
            doctorId: staffDoctor.id,
          },
        ],
      },
    },
    include: { locations: true },
  });

  const location = practice.locations[0]!;
  const doctorUser = staffDoctor;

  // Independent individual doctor (own SOLO practice — WhatsApp line 9990052082)
  const soloDoctor = await prisma.user.create({
    data: {
      email: "dr.solo@glucoguide.com",
      password: passwordHash,
      role: "doctor",
      name: "Dr. Priya Nair",
      phone: "9990052082",
      createdBy: "self_attempted",
      doctor: {
        create: {
          description: "Independent endocrinologist — solo practice.",
          hospitalId: hospital.id,
          availableTimes: "Mon–Fri 10:00–18:00",
          experience: 8,
          emails: ["dr.solo@glucoguide.com"],
          contactNumbers: ["+919990052082"],
          appointmentValidityDays: 7,
          licenseNo: "IND-SOLO-1001",
        },
      },
    },
    include: { doctor: true },
  });

  const soloPractice = await prisma.practice.create({
    data: {
      name: "Dr. Priya Nair Clinic",
      slug: "dr-priya-nair-clinic",
      type: "SOLO",
      specialty: "Endocrinology",
      consultationFee: 700,
      phone: "9990052082",
      whatsappBusinessNumber: "9990052082",
      email: "dr.solo@glucoguide.com",
      registrationNo: "IND-SOLO-1001",
      isActive: true,
      isDirectoryListed: true,
      locations: {
        create: {
          name: "Main Clinic",
          address: "Indiranagar 100 Feet Road",
          city: "Bangalore",
        },
      },
      members: {
        create: {
          userId: soloDoctor.id,
          role: "DOCTOR",
          doctorId: soloDoctor.id,
        },
      },
    },
    include: { locations: true },
  });

  const soloLocation = soloPractice.locations[0]!;
  for (const day of [
    { dayOfWeek: 1, startTime: "10:00", endTime: "14:00" },
    { dayOfWeek: 3, startTime: "10:00", endTime: "14:00" },
    { dayOfWeek: 5, startTime: "10:00", endTime: "14:00" },
  ]) {
    await prisma.providerSchedule.create({
      data: {
        practiceId: soloPractice.id,
        locationId: soloLocation.id,
        providerId: soloDoctor.id,
        dayOfWeek: day.dayOfWeek,
        mode: ScheduleMode.TIME_BASED,
        slotIntervalMin: 20,
        startTime: day.startTime,
        endTime: day.endTime,
        maxPerSlot: 1,
        isActive: true,
      },
    });
  }

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

  // Owner also practices — so clinic WhatsApp BOOK shows both doctors + specialty.
  for (const day of scheduleDays) {
    await prisma.providerSchedule.create({
      data: {
        practiceId: practice.id,
        locationId: location.id,
        providerId: clinicOwner.id,
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

  // Sample bookings so Today queue + calendar are never empty after seed.
  // Keep a "today" slot even if the wall clock is past 11:00 — demo boards
  // still need a visible appointment on the current calendar day.
  // Status ACCEPTED matches auto-accept product behaviour (not raw SCHEDULED).
  const todaySlot = new Date();
  todaySlot.setHours(11, 0, 0, 0);

  const todayWaiting = new Date();
  todayWaiting.setHours(11, 30, 0, 0);

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
      status: "WAITING",
      channel: "WEB_PORTAL",
      disease: "Blood sugar follow-up",
      slotStart: todaySlot,
      slotEnd: new Date(todaySlot.getTime() + 30 * 60_000),
    },
  });

  await prisma.practiceBooking.create({
    data: {
      practiceId: practice.id,
      locationId: location.id,
      providerId: clinicOwner.id,
      patientId: patientUser.patient!.id,
      patientPhone: "9999973601",
      patientName: "Ravi Kumar",
      mode: ScheduleMode.TIME_BASED,
      status: "ACCEPTED",
      channel: "WEB_PORTAL",
      disease: "Thyroid review",
      slotStart: todayWaiting,
      slotEnd: new Date(todayWaiting.getTime() + 30 * 60_000),
    },
  });

  await prisma.practiceBooking.create({
    data: {
      practiceId: practice.id,
      locationId: location.id,
      providerId: clinicOwner.id,
      patientId: patientUser.patient!.id,
      patientPhone: "9999973601",
      patientName: "Ravi Kumar",
      mode: ScheduleMode.TIME_BASED,
      status: "ACCEPTED",
      channel: "WEB_PORTAL",
      disease: "General consultation",
      slotStart: tomorrow,
      slotEnd: new Date(tomorrow.getTime() + 30 * 60_000),
    },
  });

  await prisma.practiceBooking.create({
    data: {
      practiceId: soloPractice.id,
      locationId: soloLocation.id,
      providerId: soloDoctor.id,
      patientId: patientUser.patient!.id,
      patientPhone: "9999973601",
      patientName: "Ravi Kumar",
      mode: ScheduleMode.TIME_BASED,
      status: "ACCEPTED",
      channel: "WEB_PORTAL",
      disease: "Endocrine consult",
      slotStart: todaySlot,
      slotEnd: new Date(todaySlot.getTime() + 30 * 60_000),
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
  const starterPlan =
    plans.find((p) => p.name === "Starter") ?? plans[0]!;

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

  await prisma.practiceSubscription.create({
    data: {
      practiceId: soloPractice.id,
      planId: starterPlan.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      notes: "Demo independent doctor — Starter plan + WhatsApp 9990052082",
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
      notes: "Minimal demo WhatsApp line (clinic)",
    },
  });

  await prisma.practice.update({
    where: { id: practice.id },
    data: { whatsappBusinessNumber: "9876543210" },
  });

  // Independent doctor WhatsApp line — +91 99900 52082
  const soloMetaPhoneId =
    process.env.GLUCOGUIDE_OTP_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    null;
  await prisma.whatsAppNumber.create({
    data: {
      phoneNumber: "9990052082",
      displayName: soloPractice.name,
      status: "LIVE",
      provider: soloMetaPhoneId ? "META_CLOUD_API" : "MOCK",
      practiceId: soloPractice.id,
      wabaPhoneNumberId: soloMetaPhoneId,
      wabaId: process.env.WHATSAPP_WABA_ID || null,
      verificationStatus: "verified",
      displayNameStatus: "approved",
      templatesStatus: "approved",
      activatedAt: new Date(),
      notes: "Independent doctor demo line (+91 99900 52082)",
    },
  });

  await NumberPoolService.syncMetaUtilityTemplates();

  console.log("\n✅ Minimal seed complete\n");
  console.log("  Clinic:   Dr. Ananya Sharma Clinic  (/practices/dr-ananya-sharma-clinic)");
  console.log("  Clinic WA:           +91 98765 43210");
  console.log("  Clinic Login:        dr.demo@glucoguide.com  (owner)");
  console.log("  Clinic staff Login:  dr.staff@glucoguide.com  (Doctor Login)");
  console.log("  Independent doctor:  dr.solo@glucoguide.com  (own SOLO practice)");
  console.log("  Independent WA:      +91 99900 52082");
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
