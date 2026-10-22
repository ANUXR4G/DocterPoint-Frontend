"use client"

import { useState, useRef } from "react"
import PopupModal from "@/components/modals/Modal"
import { proctoService } from "@/lib/services/procto"
import {
  parseMedicineExcelData,
  downloadMedicineTemplate,
  type ParsedMedicineRow,
  type ParseMedicineResult,
} from "@/lib/medicineExcel"
import type { MedicineItem } from "./MedicineManagementPage"

type Props = {
  open: boolean
  onClose: () => void
  existingMedicines: MedicineItem[]
  onSuccess: (updatedList: MedicineItem[], message: string) => void
}

export default function BulkUploadMedicineModal({
  open,
  onClose,
  existingMedicines,
  onSuccess,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [parsedResult, setParsedResult] = useState<ParseMedicineResult | null>(null)
  const [updateExisting, setUpdateExisting] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [showInvalidDetails, setShowInvalidDetails] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetState() {
    setFile(null)
    setParsing(false)
    setUploading(false)
    setParsedResult(null)
    setErrorMessage("")
    setShowInvalidDetails(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleClose() {
    resetState()
    onClose()
  }

  // Handle file selection
  function handleFileSelected(selectedFile: File) {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase()
    if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
      setErrorMessage("Please select a valid Excel (.xlsx, .xls) or CSV (.csv) file.")
      return
    }

    setFile(selectedFile)
    setErrorMessage("")
    setParsing(true)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer
        if (!buffer) {
          setErrorMessage("Failed to read the uploaded file.")
          setParsing(false)
          return
        }

        const result = parseMedicineExcelData(buffer)
        setParsedResult(result)

        if (result.validRows.length === 0) {
          setErrorMessage(
            result.invalidRows.length > 0
              ? `No valid medicine rows found in file. ${result.invalidRows.length} rows had errors.`
              : "The uploaded spreadsheet contains no medicine data rows.",
          )
        }
      } catch (err: any) {
        setErrorMessage(
          err?.message || "Error parsing Excel file. Please ensure it is a valid spreadsheet.",
        )
      } finally {
        setParsing(false)
      }
    }

    reader.onerror = () => {
      setErrorMessage("Could not read file from disk.")
      setParsing(false)
    }

    reader.readAsArrayBuffer(selectedFile)
  }

  // Drag and Drop handlers
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0])
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  // Existing code lookup
  const existingCodeMap = new Set(
    existingMedicines.map((m) => m.medicineCode.trim().toLowerCase()),
  )

  const rowsToProcess = parsedResult?.validRows ?? []
  const newItemsCount = rowsToProcess.filter(
    (r) => !existingCodeMap.has(r.medicineCode.trim().toLowerCase()),
  ).length
  const updateItemsCount = rowsToProcess.length - newItemsCount

  // Execute bulk import
  async function handleConfirmImport() {
    if (!parsedResult || parsedResult.validRows.length === 0) return

    setUploading(true)
    setErrorMessage("")

    try {
      // 1. Call Backend Bulk Upload Endpoint
      const backendItems = parsedResult.validRows.map((r) => ({
        medicineCode: r.medicineCode,
        countryCode: r.countryCode,
        brandName: r.brandName,
        genericName: r.genericName,
        strength: r.strength,
        route: r.route,
        dosageForm: r.dosageForm,
        favourite: r.favourite,
      }))

      let response: any = null
      try {
        response = await proctoService.bulkUploadMedicines(backendItems)
      } catch {
        // Fallback to client-side merge if offline/backend route is unavailable
      }

      // 2. Client-side merge into local storage & state
      let updatedList = [...existingMedicines]
      let localImported = 0
      let localUpdated = 0

      for (const row of parsedResult.validRows) {
        const codeKey = row.medicineCode.trim().toLowerCase()
        const existingIdx = updatedList.findIndex(
          (m) => m.medicineCode.trim().toLowerCase() === codeKey,
        )

        if (existingIdx !== -1) {
          if (updateExisting) {
            updatedList[existingIdx] = {
              ...updatedList[existingIdx],
              brandName: row.brandName,
              genericName: row.genericName,
              countryCode: row.countryCode || updatedList[existingIdx].countryCode,
              strength: row.strength || updatedList[existingIdx].strength,
              route: row.route || updatedList[existingIdx].route,
              dosageForm: row.dosageForm || updatedList[existingIdx].dosageForm,
              favourite: row.favourite,
              updatedAt: new Date().toISOString(),
            }
            localUpdated++
          }
        } else {
          const newItem: MedicineItem = {
            id: `med-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            medicineCode: row.medicineCode,
            countryCode: row.countryCode,
            brandName: row.brandName,
            strength: row.strength,
            route: row.route,
            dosageForm: row.dosageForm,
            genericName: row.genericName,
            favourite: row.favourite,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          updatedList = [newItem, ...updatedList]
          localImported++
        }
      }

      // If backend returned items, prefer those
      if (
        response &&
        response.status === "successful" &&
        response.data &&
        Array.isArray(response.data.items) &&
        response.data.items.length > 0
      ) {
        updatedList = response.data.items
      }

      const msg = `Bulk import complete: ${localImported} new medicines added, ${localUpdated} updated.`
      onSuccess(updatedList, msg)
      handleClose()
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to complete bulk upload. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <PopupModal
      open={open}
      handler={handleClose}
      title="Bulk Upload Medicines (Excel / CSV)"
      direction="center"
      className="!h-auto max-h-[96dvh] w-full max-w-2xl overflow-hidden"
    >
      <div className="space-y-4 text-xs">
        {/* Instructions banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 dark:border-sky-800 dark:bg-sky-950/40">
          <div className="space-y-0.5">
            <p className="font-semibold text-sky-900 dark:text-sky-200">
              Upload an Excel (.xlsx, .xls) or CSV (.csv) file
            </p>
            <p className="text-[11px] text-sky-700 dark:text-sky-300">
              Format your columns with Brand Name, Generic Name, Strength, Route, Dosage Form, and Code.
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadMedicineTemplate("xlsx")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-2xs hover:bg-sky-50 dark:border-sky-700 dark:bg-neutral-800 dark:text-sky-300"
          >
            <span>📥</span>
            <span>Download Template (.xlsx)</span>
          </button>
        </div>

        {/* Drag & Drop Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition cursor-pointer ${
            file
              ? "border-emerald-400 bg-emerald-50/30 dark:border-emerald-600 dark:bg-emerald-950/20"
              : "border-neutral-300 bg-neutral-50/50 hover:bg-neutral-100/50 dark:border-neutral-700 dark:bg-neutral-900/50 dark:hover:bg-neutral-800/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelected(e.target.files[0])
              }
            }}
          />

          <span className="text-3xl mb-1.5">📊</span>
          {file ? (
            <div className="space-y-1">
              <p className="font-bold text-neutral-900 dark:text-white">
                {file.name}
              </p>
              <p className="text-[11px] text-neutral-500">
                {(file.size / 1024).toFixed(1)} KB · Click or drag another file to replace
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                Click to browse or drag and drop your spreadsheet here
              </p>
              <p className="text-[11px] text-neutral-500">
                Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
              </p>
            </div>
          )}
        </div>

        {/* Error message banner */}
        {errorMessage ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 font-medium">
            ⚠️ {errorMessage}
          </div>
        ) : null}

        {/* Parsing indicator */}
        {parsing ? (
          <div className="py-4 text-center text-xs text-neutral-500">
            Parsing spreadsheet data…
          </div>
        ) : null}

        {/* Parsed summary & preview */}
        {parsedResult && parsedResult.validRows.length > 0 ? (
          <div className="space-y-3">
            {/* Summary badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2.5 dark:border-neutral-700">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                  Total Rows: {parsedResult.totalRows}
                </span>
                <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  ✓ {newItemsCount} New
                </span>
                {updateItemsCount > 0 ? (
                  <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ↻ {updateItemsCount} Existing Match
                  </span>
                ) : null}
                {parsedResult.invalidRows.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowInvalidDetails((v) => !v)}
                    className="rounded-md bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300 cursor-pointer"
                  >
                    ⚠ {parsedResult.invalidRows.length} Skipped (click to view)
                  </button>
                ) : null}
              </div>

              {updateItemsCount > 0 ? (
                <label className="flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Update existing medicines with matching code</span>
                </label>
              ) : null}
            </div>

            {/* Invalid rows warning details */}
            {showInvalidDetails && parsedResult.invalidRows.length > 0 ? (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-rose-200 bg-rose-50/50 p-2 text-[11px] text-rose-900 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-200 space-y-1">
                <p className="font-bold">Skipped rows details:</p>
                {parsedResult.invalidRows.map((inv, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="font-semibold">Row {inv.rowNumber}:</span>
                    <span>{inv.reason}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Preview Table */}
            <div className="space-y-1">
              <p className="font-semibold text-neutral-700 dark:text-neutral-300">
                Preview of medicines to import ({parsedResult.validRows.length} items):
              </p>
              <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="sticky top-0 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 font-semibold text-neutral-700 dark:text-neutral-200">
                      <th className="p-2">Status</th>
                      <th className="p-2">Medicine Code</th>
                      <th className="p-2">Brand Name</th>
                      <th className="p-2">Generic Name</th>
                      <th className="p-2">Strength</th>
                      <th className="p-2">Route</th>
                      <th className="p-2">Form</th>
                      <th className="p-2 text-center">Fav</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {parsedResult.validRows.map((row, idx) => {
                      const isExisting = existingCodeMap.has(
                        row.medicineCode.trim().toLowerCase(),
                      )
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
                        >
                          <td className="p-2">
                            {isExisting ? (
                              <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                Update
                              </span>
                            ) : (
                              <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                New
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-mono text-neutral-600 dark:text-neutral-400">
                            {row.medicineCode}
                            {row.isAutoCode ? (
                              <span className="ml-1 text-[9px] text-neutral-400">
                                (auto)
                              </span>
                            ) : null}
                          </td>
                          <td className="p-2 font-bold text-neutral-900 dark:text-white">
                            {row.brandName}
                          </td>
                          <td className="p-2 text-neutral-600 dark:text-neutral-300">
                            {row.genericName}
                          </td>
                          <td className="p-2 text-neutral-600 dark:text-neutral-400">
                            {row.strength || "—"}
                          </td>
                          <td className="p-2 text-neutral-600 dark:text-neutral-400">
                            {row.route}
                          </td>
                          <td className="p-2 text-neutral-600 dark:text-neutral-400">
                            {row.dosageForm}
                          </td>
                          <td className="p-2 text-center">
                            {row.favourite ? "⭐" : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!parsedResult || parsedResult.validRows.length === 0 || uploading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--theme-primary,#0284c7)] px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            {uploading ? (
              <>
                <span className="animate-spin text-sm">⏳</span>
                <span>Importing medicines…</span>
              </>
            ) : (
              <>
                <span>📤</span>
                <span>
                  Confirm &amp; Import{" "}
                  {parsedResult?.validRows.length
                    ? `(${parsedResult.validRows.length})`
                    : ""}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </PopupModal>
  )
}
