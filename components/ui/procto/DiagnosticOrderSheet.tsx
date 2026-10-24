"use client"

import { consultationModel, type ConsultBooking } from "@/lib/consultationPdf"

/** Preview layout for the dedicated Diagnostic Order print (not the full consultation). */
export default function DiagnosticOrderSheet({
  booking,
}: {
  booking: ConsultBooking
}) {
  const model = consultationModel(booking)
  const rows = model.diagnostics.length
    ? model.diagnostics
    : [{ name: "No diagnostic orders recorded", type: "", qty: undefined, instruction: "" }]

  return (
    <article className="print-sheet mx-auto max-w-3xl bg-white px-8 py-6 text-[13px] text-black">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-teal-800">{model.clinic}</p>
          {model.address ? <p>{model.address}</p> : null}
          {model.tel ? <p>Tel : {model.tel}</p> : null}
          {model.email ? <p>Email : {model.email}</p> : null}
        </div>
        {model.clinicLogoSrc ? (
          <div className="size-16 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={model.clinicLogoSrc}
              alt={model.clinic}
              className="h-full w-full object-contain"
            />
          </div>
        ) : null}
      </header>

      <h1 className="mt-4 text-center text-lg font-bold tracking-wide text-teal-800 underline">
        DIAGNOSTIC ORDERS
      </h1>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border-2 border-teal-600 px-3 py-2">
        <p>
          <span className="font-semibold text-teal-800">Patient&apos;s Name:</span>{" "}
          {model.patientName}
        </p>
        <p>
          <span className="font-semibold text-teal-800">Mobile No:</span>{" "}
          {model.mobile || "—"}
        </p>
        <p>
          <span className="font-semibold text-teal-800">Patient MRN:</span>{" "}
          {model.mrn || "—"}
        </p>
        <p>
          <span className="font-semibold text-teal-800">ID:</span> {model.shortId || "—"}
        </p>
        <p>
          <span className="font-semibold text-teal-800">Date of Birth:</span>{" "}
          {model.dob || "—"}
        </p>
        <p>
          <span className="font-semibold text-teal-800">Age / Gender:</span>{" "}
          {model.ageGender || "—"}
        </p>
        <p className="break-all">
          <span className="font-semibold text-teal-800">Visit ID:</span> {model.visitId}
        </p>
        <p>
          <span className="font-semibold text-teal-800">Appointment:</span>{" "}
          {model.appointment || "—"}
        </p>
        <p className="col-span-2">
          <span className="font-semibold text-teal-800">Doctor:</span> {model.doctor || "—"}
        </p>
      </div>

      <section className="mt-5">
        <h2 className="font-bold text-teal-800">DIAGNOSTIC ORDERS</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b-2 border-neutral-800">
                <th className="w-10 py-1.5 pr-2 font-semibold">SNo</th>
                <th className="w-28 py-1.5 pr-2 font-semibold">Category</th>
                <th className="py-1.5 pr-2 font-semibold">Description</th>
                <th className="w-12 py-1.5 pr-2 font-semibold">Qty</th>
                <th className="py-1.5 pr-2 font-semibold">Instruction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((dx, i) => (
                <tr key={`${dx.name}-${i}`} className="border-b border-neutral-300">
                  <td className="py-1.5 pr-2">{model.diagnostics.length ? i + 1 : "—"}</td>
                  <td className="py-1.5 pr-2">{dx.type || "—"}</td>
                  <td className="py-1.5 pr-2 font-semibold">{dx.name}</td>
                  <td className="py-1.5 pr-2">{dx.qty ?? (model.diagnostics.length ? 1 : "—")}</td>
                  <td className="py-1.5 pr-2">{dx.instruction || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-10 flex items-end justify-between gap-6 border-t border-neutral-200 pt-4">
        <div>
          <div className="mt-1 flex items-end gap-4">
            {model.stampSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={model.stampSrc} alt="Doctor stamp" className="h-14 object-contain" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-teal-600 text-[9px] text-teal-700">
                Stamp
              </div>
            )}
            {model.clinicStampSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={model.clinicStampSrc}
                alt="Clinic stamp"
                className="h-14 object-contain"
              />
            ) : null}
          </div>
          <p className="mt-2 font-semibold">{model.doctor}</p>
          {model.qualification ? <p className="text-xs">{model.qualification}</p> : null}
          {model.license ? <p className="text-xs">Reg. No: {model.license}</p> : null}
        </div>
        <div className="text-right text-[10px] text-neutral-500">
          <p>Printed On : {model.printed}</p>
          <p>Page 1 of 1</p>
        </div>
      </footer>
    </article>
  )
}
