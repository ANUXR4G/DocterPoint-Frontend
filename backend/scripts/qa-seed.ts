/**
 * QA demo data — upserts identifiable QA_* accounts without wiping the DB.
 * Run: cd backend && npx tsx scripts/qa-seed.ts
 */
import bcrypt from "bcrypt";
import {
  BookingChannel,
  BookingStatus,
  PrismaClient,
  ScheduleMode,
} from "@prisma/client";
import { allocateUniquePracticeMrnPrefix } from "../src/core/patientMrn.js";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo@12345";

async function upsertUser(opts: {
  email: string;
  role: "user" | "doctor" | "admin";
  name: string;
  phone: string;
  passwordHash: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: opts.email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        password: opts.passwordHash,
        name: opts.name,
        phone: opts.phone,
        role: opts.role,
      },
    });
  }
  return prisma.user.create({
    data: {
      email: opts.email,
      password: opts.passwordHash,
      role: opts.role,
      name: opts.name,
      phone: opts.phone,
    },
  });
}

async function main() {
  console.log("Seeding QA demo data (non-destructive upsert)…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Ensure platform admin exists (bug: missing admin broke QA suite)
  await upsertUser({
    email: "admin@glucoguide.com",
    role: "admin",
    name: "QA_ADMIN",
    phone: "9000000000",
    passwordHash,
  });

  const hospital =
    (await prisma.hospital.findFirst({ where: { name: "QA_HOSPITAL_CITY" } })) ||
    (await prisma.hospital.create({
      data: {
        name: "QA_HOSPITAL_CITY",
        address: "QA Road 1",
        city: "Bengaluru",
        description: "QA hospital for GlucoGuide e2e",
        imgSrc: "https://images.pexels.com/photos/263402/pexels-photo-263402.jpeg",
        emails: ["qa@glucoguide.com"],
        contactNumbers: ["+919000000001"],
        geometry: { type: "Point", coordinates: [77.5946, 12.9716] },
      },
    }));

  // Doctor A
  let doctorA = await prisma.user.findUnique({
    where: { email: "qa.doctor.a@glucoguide.com" },
    include: { doctor: true },
  });
  if (!doctorA) {
    doctorA = await prisma.user.create({
      data: {
        email: "qa.doctor.a@glucoguide.com",
        password: passwordHash,
        role: "doctor",
        name: "QA_DOCTOR_A",
        phone: "9111000001",
        doctor: {
          create: {
            description: "QA endocrinologist A",
            hospitalId: hospital.id,
            availableTimes: "Mon–Fri 9:00–17:00",
            experience: 8,
            emails: ["qa.doctor.a@glucoguide.com"],
            contactNumbers: ["+919111000001"],
            appointmentValidityDays: 7,
          },
        },
      },
      include: { doctor: true },
    });
  } else {
    await prisma.user.update({
      where: { id: doctorA.id },
      data: { password: passwordHash, name: "QA_DOCTOR_A" },
    });
  }

  // Doctor B
  let doctorB = await prisma.user.findUnique({
    where: { email: "qa.doctor.b@glucoguide.com" },
    include: { doctor: true },
  });
  if (!doctorB) {
    doctorB = await prisma.user.create({
      data: {
        email: "qa.doctor.b@glucoguide.com",
        password: passwordHash,
        role: "doctor",
        name: "QA_DOCTOR_B",
        phone: "9111000002",
        doctor: {
          create: {
            description: "QA cardiologist B",
            hospitalId: hospital.id,
            availableTimes: "Mon–Sat 10:00–18:00",
            experience: 15,
            emails: ["qa.doctor.b@glucoguide.com"],
            contactNumbers: ["+919111000002"],
            appointmentValidityDays: 14,
          },
        },
      },
      include: { doctor: true },
    });
  } else {
    await prisma.user.update({
      where: { id: doctorB.id },
      data: { password: passwordHash, name: "QA_DOCTOR_B" },
    });
  }

  let practice =
    (await prisma.practice.findUnique({
      where: { slug: "qa-clinic-a" },
      include: { locations: true, members: true },
    })) || null;

  if (!practice) {
    practice = await prisma.practice.create({
      data: {
        name: "QA_CLINIC_A",
        slug: "qa-clinic-a",
        type: "CLINIC",
        specialty: "Diabetes QA",
        consultationFee: 700,
        mrnPrefix: await allocateUniquePracticeMrnPrefix("QA_CLINIC_A"),
        phone: "9111000001",
        email: "qa.doctor.a@glucoguide.com",
        isActive: true,
        isDirectoryListed: true,
        locations: {
          create: {
            name: "QA Main",
            address: "QA Street 12",
            city: "Bengaluru",
            businessHours: {
              mon: "09:00-17:00",
              tue: "09:00-17:00",
              wed: "09:00-17:00",
              thu: "09:00-17:00",
              fri: "09:00-17:00",
            },
          },
        },
        members: {
          create: [
            {
              userId: doctorA.id,
              role: "PRACTICE_OWNER",
              doctorId: doctorA.id,
            },
            {
              userId: doctorB.id,
              role: "DOCTOR",
              doctorId: doctorB.id,
            },
          ],
        },
      },
      include: { locations: true, members: true },
    });
  }

  const location = practice.locations[0]!;

  // Schedules for both doctors Mon–Fri
  for (const doc of [doctorA, doctorB]) {
    for (const day of [1, 2, 3, 4, 5]) {
      const exists = await prisma.providerSchedule.findFirst({
        where: {
          practiceId: practice.id,
          providerId: doc.id,
          locationId: location.id,
          dayOfWeek: day,
        },
      });
      if (!exists) {
        await prisma.providerSchedule.create({
          data: {
            practiceId: practice.id,
            providerId: doc.id,
            locationId: location.id,
            dayOfWeek: day,
            mode: ScheduleMode.TIME_BASED,
            startTime: "09:00",
            endTime: "17:00",
            slotIntervalMin: 20,
          },
        });
      }
    }
  }

  // Plans + subscription
  const { NumberPoolService } = await import(
    "../src/services/procto/numberPool.service.js"
  );
  const plans = await NumberPoolService.ensureDefaultPlans();
  const growth = plans.find((p) => p.name === "Growth") || plans[0]!;
  const sub = await prisma.practiceSubscription.findFirst({
    where: { practiceId: practice.id },
  });
  if (!sub) {
    await prisma.practiceSubscription.create({
      data: {
        practiceId: practice.id,
        planId: growth.id,
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        notes: "QA_CLINIC_A Growth",
      },
    });
  }

  // Patients A/B/C
  const patients = [
    {
      email: "qa.patient.a@glucoguide.com",
      name: "QA_PATIENT_A",
      phone: "9222000001",
      disease: "Type 2 diabetes",
      notes: "QA history A — metformin",
    },
    {
      email: "qa.patient.b@glucoguide.com",
      name: "QA_PATIENT_B",
      phone: "9222000002",
      disease: "Hypertension",
      notes: "QA history B — amlodipine",
    },
    {
      email: "qa.patient.c@glucoguide.com",
      name: "QA_PATIENT_C",
      phone: "9222000003",
      disease: "Prediabetes",
      notes: "QA history C — lifestyle only",
    },
  ] as const;

  const patientUsers: { id: string; phone: string; name: string; disease: string; notes: string }[] =
    [];

  for (const p of patients) {
    let user = await prisma.user.findUnique({
      where: { email: p.email },
      include: { patient: true },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: p.email,
          password: passwordHash,
          role: "user",
          name: p.name,
          phone: p.phone,
          patient: {
            create: {
              contactNumber: p.phone,
            },
          },
        },
        include: { patient: true },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash, name: p.name, phone: p.phone },
      });
      if (!user.patient) {
        await prisma.patient.create({
          data: { id: user.id, contactNumber: p.phone },
        });
      }
    }
    patientUsers.push({
      id: user.id,
      phone: p.phone,
      name: p.name,
      disease: p.disease,
      notes: p.notes,
    });
  }

  // Clear prior QA-labelled bookings for this clinic to avoid duplicates on re-run
  await prisma.practiceBooking.deleteMany({
    where: {
      practiceId: practice.id,
      OR: [
        { patientName: { startsWith: "QA_PATIENT_" } },
        { notes: { startsWith: "QA_" } },
      ],
    },
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const statuses: BookingStatus[] = [
    BookingStatus.SCHEDULED,
    BookingStatus.IN_PROGRESS,
    BookingStatus.COMPLETED,
    BookingStatus.CANCELED,
    BookingStatus.NO_SHOW,
  ];

  let i = 0;
  for (const patient of patientUsers) {
    for (const status of statuses.slice(0, patient.name === "QA_PATIENT_A" ? 5 : 2)) {
      i += 1;
      const slot = new Date(patient.name === "QA_PATIENT_A" ? tomorrow : dayAfter);
      slot.setMinutes(slot.getMinutes() + i * 20);
      const end = new Date(slot.getTime() + 20 * 60_000);
      await prisma.practiceBooking.create({
        data: {
          practiceId: practice.id,
          locationId: location.id,
          providerId: i % 2 === 0 ? doctorB.id : doctorA.id,
          patientId: patient.id,
          patientPhone: patient.phone,
          patientName: patient.name,
          mode: ScheduleMode.TIME_BASED,
          status,
          channel: BookingChannel.WEB,
          slotStart: slot,
          slotEnd: end,
          disease: patient.disease,
          notes: `QA_APPOINTMENT_${String(i).padStart(3, "0")} — ${patient.notes}`,
          consultationType: "in_person",
          doctorRemarks:
            status === BookingStatus.COMPLETED
              ? `QA remark for ${patient.name}`
              : null,
          medicines:
            status === BookingStatus.COMPLETED
              ? [{ name: "Metformin", amount: "500mg", times: ["morning", "night"] }]
              : undefined,
          documents:
            status === BookingStatus.COMPLETED
              ? [
                  {
                    name: "QA_RX_REPORT.pdf",
                    url: "https://example.com/qa/QA_RX_REPORT.pdf",
                  },
                ]
              : undefined,
        },
      });
    }
  }

  // Review on completed booking for Patient A
  const completed = await prisma.practiceBooking.findFirst({
    where: {
      practiceId: practice.id,
      patientId: patientUsers[0]!.id,
      status: BookingStatus.COMPLETED,
    },
  });
  if (completed) {
    await prisma.practiceReview.deleteMany({ where: { bookingId: completed.id } });
    await prisma.practiceReview.create({
      data: {
        practiceId: practice.id,
        bookingId: completed.id,
        patientId: patientUsers[0]!.id,
        providerId: completed.providerId,
        authorName: "QA_PATIENT_A",
        authorPhone: patientUsers[0]!.phone,
        rating: 5,
        providerRating: 4,
        body: "QA review — excellent visit",
        isPublished: true,
      },
    });
  }

  console.log("\n✅ QA seed complete\n");
  console.log("  Password for all QA accounts: Demo@12345\n");
  console.log("  QA_ADMIN     admin@glucoguide.com");
  console.log("  QA_DOCTOR_A  qa.doctor.a@glucoguide.com");
  console.log("  QA_DOCTOR_B  qa.doctor.b@glucoguide.com");
  console.log("  QA_PATIENT_A qa.patient.a@glucoguide.com");
  console.log("  QA_PATIENT_B qa.patient.b@glucoguide.com");
  console.log("  QA_PATIENT_C qa.patient.c@glucoguide.com");
  console.log("  Clinic slug: qa-clinic-a\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
