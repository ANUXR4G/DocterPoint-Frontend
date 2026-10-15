"use client"

import { prescriptionModel, type RxBooking } from "@/lib/prescriptionPdf"

export default function PrescriptionSheet({ booking }: { booking: RxBooking }) {
  const model = prescriptionModel(booking)
  return (
    <article className="mx-auto max-w-3xl bg-white px-8 py-6 text-[13px] text-black">
      <div className="grid grid-cols-[72px_1fr_72px] items-start">
        <p className="text-xs font-semibold">Logo</p>
        <div className="text-center">
          <p className="text-base font-semibold">{model.clinic}</p>
          {model.address ? <p className="mt-0.5">{model.address}</p> : null}
        </div>
      </div>
      <div className="mt-3 border-t border-black pt-2">
        <div className="flex justify-between gap-4 font-semibold">
          <p>ID: {model.id}</p>
          <p>Date: {model.date}</p>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-6 font-semibold">
          <p>Name : {model.nameLine}</p>
          <p>Mob. No.: {model.phone}</p>
          <p>Address: {model.patientAddress}</p>
          <p>Email : {model.email}</p>
        </div>
        <p className="mt-2">{model.vitals}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 border border-black">
        <div className="border-r border-black px-2 py-1">
          <p className="border-b border-black pb-1 font-semibold">Chief Complaints</p>
          <div className="min-h-16 py-1">
            {model.complaints.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <div className="px-2 py-1">
          <p className="border-b border-black pb-1 font-semibold">Allergy</p>
          <div className="min-h-16 py-1">
            {model.allergies.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 font-semibold">Diagnosis:</p>
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
          {model.medicines.length === 0 ? (
            <tr>
              <td className="py-2" colSpan={3} />
            </tr>
          ) : (
            model.medicines.map((med, index) => (
              <tr key={`${med.name}-${index}`} className="align-top">
                <td className="py-1 pr-3">
                  <p>
                    {index + 1}) {med.name}
                  </p>
                  {med.strength ? <p className="pl-4 text-[11px]">{med.strength}</p> : null}
                </td>
                <td className="py-1 pr-3">{med.dosage}</td>
                <td className="py-1">{med.duration}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-3 font-semibold">Advice:</p>
      <div className="min-h-10">
        {model.advice.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <p className="mt-6 border-t border-black pt-2 text-xs">Printed on : {model.printed}</p>
    </article>
  )
}
