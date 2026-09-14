# Gender & Practice Analytics — Flows + Classes

**Audience:** engineering, QA  
**Related:** [flow.md](./flow.md) § analytics / WhatsApp register · Canonical values: `male` | `female` | `others` (null → `unknown` in charts)

This document describes how patient gender is written, normalized, attributed onto bookings, and rolled into Clinic-plan analytics — with UML-style classes (attributes) and flowcharts.

---

## 1. Domain class diagram (attributes)

```mermaid
classDiagram
  direction TB

  class User {
    +UUID id
    +String email
    +String role
    +String? name
    +String? gender
    +String? phone
    +String? address
    +DateTime createdAt
    +DateTime updatedAt
  }

  class Patient {
    +UUID id
    +String? contactNumber
    +String? dateOfBirth
    +String? aadharNumber
    +String? panNumber
  }

  class Practice {
    +UUID id
    +String name
    +String slug
    +PracticeType type
    +String? phone
    +String? whatsappBusinessNumber
    +Boolean isActive
  }

  class PracticeBooking {
    +UUID id
    +UUID practiceId
    +UUID providerId
    +UUID? patientId
    +String patientPhone
    +String? patientName
    +BookingStatus status
    +BookingChannel channel
    +DateTime? slotStart
    +DateTime? sessionDate
  }

  class PracticeMember {
    +UUID id
    +UUID practiceId
    +UUID userId
    +PracticeMemberRole role
    +Boolean isActive
  }

  class GenderValue {
    <<enumeration>>
    male
    female
    others
  }

  class GenderBucket {
    <<enumeration>>
    male
    female
    others
    unknown
  }

  class AnalyticsCell {
    +GenderCounts patients
    +GenderCounts appointments
    +AnalyticsCell? compare
  }

  class GenderCounts {
    +Int male
    +Int female
    +Int others
    +Int unknown
  }

  class AnalyticsSeries {
    +Map~String,AnalyticsCell~ series
    +DoctorRow[] byDoctor
  }

  class DoctorRow {
    +UUID providerId
    +String name
    +Int bookings
    +Int waiting
    +Int inProgress
    +Int completed
    +Int canceled
    +Int noShow
  }

  User "1" --> "0..1" Patient : has
  User --> GenderValue : gender
  Practice "1" --> "*" PracticeBooking : bookings
  Practice "1" --> "*" PracticeMember : members
  PracticeBooking --> User : patientId optional
  PracticeBooking ..> GenderBucket : attributed via analytics
  AnalyticsSeries --> AnalyticsCell
  AnalyticsCell --> GenderCounts
  AnalyticsSeries --> DoctorRow
```

### Attribute notes

| Class | Key attributes | Notes |
|-------|----------------|-------|
| `User.gender` | `String?` | Stored as `male` / `female` / `others` only after `normalizeGender()`. |
| `Patient.contactNumber` | `String?` | Used with `User.phone` for last-10 phone join when `patientId` is null. |
| `PracticeBooking.patientPhone` | required | WhatsApp / guest bookings may omit `patientId`. |
| `AnalyticsCell` | period label key | Labels: hour (`00:00`), weekday, day-of-month, or month name (`September`). |
| `GenderBucket.unknown` | chart only | Null / unnormalized gender — never written to `User.gender`. |

---

## 2. Normalization helper (shared)

```mermaid
classDiagram
  class GenderCore {
    <<module backend/src/core/gender.ts>>
    +normalizeGender(raw) GenderValue|null
    +last10Digits(raw) String
  }

  class Writers {
    PatientService.changePatientInformation
    PatientService.registerViaWhatsApp
    whatsapp.orchestrator.parseGender
    idScan.normalizeGender
  }

  Writers --> GenderCore : call
```

**`normalizeGender` inputs → outputs**

| Input examples | Output |
|----------------|--------|
| `m`, `male`, `पुरुष` | `male` |
| `f`, `female`, `महिला` | `female` |
| `o`, `other`, `others`, `अन्य` | `others` |
| empty / garbage | `null` |

---

## 3. Gender write flow

```mermaid
flowchart TD
  subgraph sources [Write sources]
    WebReg[Web_register_profile]
    Mobile[Mobile_profile_chips]
    WAReg[WhatsApp_REGISTER]
    IdOCR[ID_OCR_scan]
  end

  subgraph normalize [Normalize]
    NG[normalizeGender]
  end

  subgraph store [Persist]
    UserRow[(User.gender)]
  end

  WebReg --> NG
  Mobile --> NG
  WAReg --> NG
  IdOCR --> NG
  NG -->|male_female_others| UserRow
  NG -->|null| Skip[Leave_null_or_skip]
```

```mermaid
flowchart LR
  subgraph waRegister [WhatsApp REGISTER]
    A[awaiting_register_gender] --> B{parseGender}
    B -->|ok| C[regGender_set]
    B -->|fail| D[askRegisterGender]
    C --> E[confirm_YES]
    E --> F[registerViaWhatsApp]
    F --> G[(User + Patient)]
  end
```

---

## 4. Analytics attribution flow

Clinic plan feature flag: `queueAnalytics` (`PracticeService.getAnalytics`).

```mermaid
flowchart TD
  Start([GET_practices_id_analytics]) --> Gate{queueAnalytics?}
  Gate -->|no| Err[403_upgrade_Clinic]
  Gate -->|yes| Load[Load_PracticeBookings_in_range]
  Load --> Resolve[Resolve_gender_per_booking]
  Resolve --> Buckets[Accumulate_into_period_cells]
  Buckets --> Out[Return_series_plus_byDoctor]

  subgraph resolveDetail [genderOf booking]
    R1{patientId?}
    R1 -->|yes| R2[User.gender_by_id]
    R1 -->|no / miss| R3[last10_phone_map]
    R2 --> R4[normalizeGender]
    R3 --> R4
    R4 -->|male_female_others| R5[bucket]
    R4 -->|null| R6[unknown]
  end

  Resolve -.-> resolveDetail
```

### Phone join rule

```text
booking.patientPhone  → last10Digits → Map key
User.phone            → last10Digits → Map key
Patient.contactNumber → last10Digits → Map key

Prefer: patientId → User.gender
Fallback: genderByPhone.get(last10(booking.patientPhone))
```

### Cell accumulation

For each period bucket:

1. `appointments[bucket] += 1` per booking.
2. `patients[bucket] += 1` once per distinct last-10 phone in that gender bucket.

YoY adds the same shape under `compare` for the prior year.

---

## 5. API → UI sequence

```mermaid
sequenceDiagram
  participant UI as DoctorDashboard_or_AnalyticsPage
  participant Hook as useAnalytics
  participant API as GET_/procto/practices/:id/analytics
  participant Svc as PracticeService.getAnalytics
  participant DB as Postgres

  UI->>Hook: param week_month_year_yoy
  Hook->>API: type=param
  API->>Svc: assertMember + assertFeature
  Svc->>DB: PracticeBooking + User by id/phone
  DB-->>Svc: rows
  Svc-->>API: series + byDoctor
  API-->>Hook: series cells with male female others unknown
  Hook-->>UI: totals metrics MoM_percent charts
```

### Frontend totals / MoM

| UI surface | Period fetch | Totals | MoM % |
|------------|--------------|--------|-------|
| Dashboard cards | `year` | Current month name cell | Adjacent months in year series |
| Charts strip / analytics page | Selected period | Sum of all cells | MoM only when series is year-shaped |
| Provider app | day / week / month | Sum of all cells | N/A (bars only) |

---

## 6. Period bucket classes (logical)

```mermaid
classDiagram
  class PeriodDay {
    labels 00:00 .. 23:00
  }
  class PeriodWeek {
    labels Sunday .. Saturday
  }
  class PeriodMonth {
    labels 1 .. daysInMonth
  }
  class PeriodYear {
    labels January .. December
  }
  class PeriodYoY {
    labels January .. December
    +compare prior year
  }

  PeriodDay ..> AnalyticsCell
  PeriodWeek ..> AnalyticsCell
  PeriodMonth ..> AnalyticsCell
  PeriodYear ..> AnalyticsCell
  PeriodYoY ..> AnalyticsCell
```

---

## 7. File map

| Layer | Path |
|-------|------|
| Gender util | `backend/src/core/gender.ts` |
| Analytics | `backend/src/services/procto/practice.service.ts` → `getAnalytics` |
| WA gender | `backend/src/services/procto/whatsapp.orchestrator.ts` |
| Patient write | `backend/src/services/patient.ts` |
| Hook | `frontend/hooks/useAnalysis.ts` |
| Charts | `frontend/components/charts/DoctorCharts.tsx` |
| Dashboard cards | `frontend/components/ui/doctors/dashboard/Analytics.tsx` |
| Mobile chips | `apps/mobile/app/(app)/profile.tsx` |
| Provider bars | `apps/provider/app/(app)/analytics.tsx` |

---

## 8. Invariants (QA)

1. `User.gender` is only `male` | `female` | `others` | `null` after any write path.
2. Analytics never drops bookings: unattributed gender → `unknown`.
3. `+91XXXXXXXXXX` and `XXXXXXXXXX` resolve to the same gender when a matching user exists.
4. Year totals equal the sum of twelve month cells (not “current month only”).
5. Dashboard MoM uses year series month labels (`October`, not typos).
