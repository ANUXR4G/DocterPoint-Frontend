"use client"

import { consultationModel, type ConsultBooking } from "@/lib/consultationPdf"

export default function ConsultationSheet({ booking }: { booking: ConsultBooking }) {
  const model = consultationModel(booking)
  const heads = ["Date/Time", "Ht (cm)", "Wt (kg)", "BMI", "Temp (°C)", "BP (mmHg)", "Resp (/min)", "SpO2 (%)", "HC (cm)", "PR (bpm)"]
  const cells = [model.recordedAt || "—", ...model.vitals]
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
        ) : null}
      </header>
      <h1 className="mt-4 text-center text-lg font-bold tracking-wide underline">
        CLINIC VISIT REPORT
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
      <section className="mt-4">
        <h2 className="font-bold">CHIEF COMPLAINT</h2>
        <p>Primary Reason: {model.chief}</p>
        <p>Secondary Complaints: {model.secondary}</p>
      </section>
      <section className="mt-4">
        <h2 className="font-bold">VITAL SIGNS</h2>
        <p>Result Interpretation: {model.interpretation}</p>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-neutral-400">
                {heads.map((head) => (
                  <th key={head} className="py-1 pr-2 font-semibold">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-300">
                {cells.map((cell, index) => (
                  <td key={`${heads[index]}-${cell}`} className="py-1 pr-2">{cell}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1">Additional Vitals: {model.extraVitals || "—"}</p>
      </section>
      <section className="mt-4">
        <h2 className="font-bold">ALLERGIES</h2>
        <p>{model.allergies}</p>
      </section>
      <section className="mt-3">
        <h2 className="font-bold">PAIN COMPLAINTS</h2>
        <p>{model.pain}</p>
      </section>
      <section className="mt-3">
        <h2 className="font-bold">DIAGNOSIS</h2>
        <p className="print-dx">{model.diagnosis || "—"}</p>
      </section>
      <section className="mt-4">
        <h2 className="font-bold">Doctor Notes:</h2>
        <div className="mt-1 min-h-16 whitespace-pre-wrap rounded-md border border-neutral-400 px-3 py-2">
          {model.remarks || "No doctor notes recorded."}
        </div>
      </section>
      {model.diagnostics.length > 0 ? (
        <section className="mt-4">
          <h2 className="font-bold">DIAGNOSTIC ORDERS</h2>
          <table className="mt-1 w-full border-collapse text-left">
            <thead>
              <tr className="border-y border-black">
                <th className="py-1 font-semibold">Type</th>
                <th className="py-1 font-semibold">Description</th>
                <th className="py-1 font-semibold">Qty</th>
                <th className="py-1 font-semibold">Instruction</th>
              </tr>
            </thead>
            <tbody>
              {model.diagnostics.map((dx, index) => (
                <tr key={`${dx.name}-${index}`} className="align-top">
                  <td className="py-1 pr-3">{dx.type}</td>
                  <td className="py-1 pr-3">
                    {index + 1}) {dx.name}
                  </td>
                  <td className="py-1 pr-3">{dx.qty}</td>
                  <td className="py-1">{dx.instruction || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <section className="mt-4">
        <h2 className="font-bold">PRESCRIPTION</h2>
        <p className="text-base font-semibold">Rx</p>
        <table className="mt-1 w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-black">
              <th className="py-1 font-semibold">Medicine Name</th>
              <th className="py-1 font-semibold">Dosage</th>
              <th className="py-1 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody>
            {model.medicines.length === 0 ? (
              <tr>
                <td className="py-2" colSpan={3}>No medicines prescribed.</td>
              </tr>
            ) : (
              model.medicines.map((med, index) => (
                <tr key={`${med.name}-${index}`} className="align-top">
                  <td className="py-1 pr-3">
                    <p>{index + 1}) {med.name}</p>
                    {med.strength ? <p className="pl-4 text-[11px] text-neutral-600">{med.strength}</p> : null}
                  </td>
                  <td className="py-1 pr-3">{med.dosage}</td>
                  <td className="py-1">{med.duration}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <section className="mt-4">
        <h2 className="font-bold">ADVICE</h2>
        <div className="mt-1 min-h-12 whitespace-pre-wrap rounded-md border border-neutral-400 px-3 py-2">
          {model.advice || "No advice recorded."}
        </div>
      </section>
      <footer className="mt-8 border-t border-neutral-800 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col items-center">
            <div className="flex size-28 items-center justify-center overflow-hidden rounded-full border-2 border-cyan-600 bg-white">
              {model.stampSrc && (/^https?:/i.test(model.stampSrc) || /^data:/i.test(model.stampSrc)) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={model.stampSrc} alt="Doctor stamp" className="h-full w-full object-contain" />
              ) : (
                <span className="px-3 text-center text-[11px] font-semibold leading-tight text-neutral-800">
                  {model.doctor || "Doctor"}
                  {model.qualification ? <span className="mt-1 block font-normal text-[10px]">{model.qualification}</span> : null}
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
        <p className="mt-4 text-[11px] text-neutral-500">Printed On : {model.printed}</p>
      </footer>
    </article>
  )
}
