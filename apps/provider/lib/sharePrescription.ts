import { Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import {
  buildPrescriptionPdf,
  prescriptionFileName,
  type RxBooking,
} from "@/lib/prescriptionPdf";
import {
  buildConsultationPdf,
  consultationFileName,
  type ConsultBooking,
} from "@/lib/consultationPdf";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa(binary);
}

export async function sharePrescriptionPdf(booking: RxBooking) {
  const bytes = await buildPrescriptionPdf(booking);
  const uri = `${FileSystem.cacheDirectory}${prescriptionFileName(booking)}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Share.share({ url: uri, title: "Prescription", message: "Prescription" });
}

export async function shareConsultationPdf(booking: ConsultBooking) {
  const bytes = await buildConsultationPdf(booking);
  const uri = `${FileSystem.cacheDirectory}${consultationFileName(booking)}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Share.share({ url: uri, title: "Consultation", message: "Consultation" });
}
