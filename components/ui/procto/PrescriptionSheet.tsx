"use client"

import { prescriptionModel, type RxBooking } from "@/lib/prescriptionPdf"

export default function PrescriptionSheet({ booking }: { booking: RxBooking }) {
  const model = prescriptionModel(booking)
  return (
    <article className="print-sheet mx-auto max-w-3xl bg-white px-8 py-6 text-[13px] text-black">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold">{model.clinic}</p>
          {model.address ? <p>{model.address}</p> : null}
          {model.tel ? <p>Tel : {model.tel}</p> : null}
          {model.email ? <p>Email : {model.email}</p> : null}
        </div>
        {model.clinicLogoSrc ? (
          <div className="size-16 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={model.clinicLogoSrc} alt={model.clinic} className="h-full w-full object-contain" />
          </div>
        ) : (
          <div
            aria-hidden
            className="print-logo grid size-10 shrink-0 place-items-center rounded-md border text-2xl font-bold leading-none"
          >
            +
          </div>
        )}
      </header>
      <h1 className="mt-4 text-center text-lg font-bold tracking-wide underline">
        PHARMACY PRESCRIPTION
      </h1>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border-2 border-cyan-500 px-3 py-2">
        <p><span className="print-accent font-semibold">Patient&apos;s Name:</span> {model.patientName}</p>
        <p><span className="print-accent font-semibold">Mobile No:</span> {model.mobile || "—"}</p>
        <p><span className="print-accent font-semibold">Patient MRN:</span> {model.mrn || "—"}</p>
        <p><span className="print-accent font-semibold">ID:</span> {model.shortId}</p>
        <p><span className="print-accent font-semibold">Date of Birth:</span> {model.dob || "—"}</p>
        <p><span className="print-accent font-semibold">Age / Gender:</span> {model.ageGender || "—"}</p>
        <p className="break-all"><span className="print-accent font-semibold">Visit ID:</span> {model.visitId}</p>
        <p><span className="print-accent font-semibold">Appointment:</span> {model.appointment || "—"}</p>
        <p className="col-span-2"><span className="print-accent font-semibold">Doctor</span> {model.doctor || "—"}</p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 className="font-bold">CHIEF COMPLAINT</h2>
          <p>{model.chiefLine}</p>
        </div>
        <div className="font-semibold">
          {model.allergyLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <p className="mt-3 font-bold">Diagnosis</p>
      <p className="print-dx text-base font-semibold">{model.diagnosis || "—"}</p>
      {model.vitalLine ? <p className="mt-2 font-semibold">{model.vitalLine}</p> : null}
      <p className="mt-3 text-base font-semibold">Rx</p>
      <table className="mt-1 w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-black">
            <th className="py-1 font-semibold">Medicine Name</th>
            <th className="py-1 font-semibold">Dosage</th>
            <th className="py-1 font-semibold">Duration</th>
          </tr>
        </thead>
        <tbody>
          {model.pharmacy.length === 0 ? (
            <tr>
              <td className="py-2" colSpan={3}>No medicines prescribed.</td>
            </tr>
          ) : (
            model.pharmacy.map((med, index) => (
              <tr key={`${med.name}-${index}`} className="align-top">
                <td className="py-1 pr-3">
                  <p>{index + 1}) {med.name}</p>
                  {med.strength ? <p className="pl-4 text-[11px]">{med.strength}</p> : null}
                </td>
                <td className="py-1 pr-3">
                  <p>{med.dosage}</p>
                  {med.instruction ? <p>({med.instruction})</p> : null}
                </td>
                <td className="py-1">
                  <p>{med.duration}</p>
                  {med.total ? <p>{med.total}</p> : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-3 font-bold">Advice:</p>
      <div className="min-h-8">
        {model.advice.length === 0 ? (
          <p className="text-neutral-500 italic">No advice recorded.</p>
        ) : (
          model.advice.map((line) => (
            <p key={line}>{line}</p>
          ))
        )}
      </div>
      <footer className="mt-8">
        <div className="flex flex-wrap items-end justify-around gap-6">
          <div className="flex flex-col items-center">
            <div className="flex size-28 items-center justify-center overflow-hidden rounded-full border-2 border-cyan-600 bg-white text-center text-[11px] font-semibold leading-tight">
              {model.stampSrc && (/^https?:/i.test(model.stampSrc) || /^data:/i.test(model.stampSrc)) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={model.stampSrc} alt="Doctor stamp" className="h-full w-full object-contain" />
              ) : (
                <span className="px-3">
                  {model.doctor || "Doctor"}
                  {model.license ? <span className="mt-1 block font-normal text-[10px]">{model.license}</span> : null}
                </span>
              )}
            </div>
            <span className="mt-1.5 text-center text-[11px] font-medium text-neutral-600">
              Doctor&apos;s Stamp / Signature
            </span>
          </div>

          {model.clinicStampSrc ? (
            <div className="flex flex-col items-center">
              <div className="flex size-28 items-center justify-center overflow-hidden rounded-xl border border-neutral-300 bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={model.clinicStampSrc} alt="Clinic stamp" className="h-full w-full object-contain" />
              </div>
              <span className="mt-1.5 text-center text-[11px] font-medium text-neutral-600">
                Clinic Stamp
              </span>
            </div>
          ) : null}
        </div>
        <p className="mt-6 border-t border-black pt-2 text-[11px]">Printed On : {model.printed}</p>
      </footer>
    </article>
  )
}
