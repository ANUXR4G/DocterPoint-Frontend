import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { isFinishedStatus } from "@/lib/bookingStatus";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { updateBookingStatus } from "@/lib/procto";

const CONFIRM: Record<string, { title: string; body: string; cta: string }> = {
  NO_SHOW: {
    title: "Mark as no-show?",
    body: "The visit is closed and can't be reopened.",
    cta: "No-show",
  },
  CANCELED: {
    title: "Cancel this visit?",
    body: "The slot is released and the visit can't be reopened.",
    cta: "Cancel visit",
  },
};

/** Queue status chips (Arrived / Start / No-show / Cancel) shared by Home and Today. */
export function useBookingStatusActions() {
  const { bookings, patchBooking, refresh } = usePracticeLive();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const apply = useCallback(
    async (id: string, status: string) => {
      setBusyId(id);
      const res = await updateBookingStatus(id, status);
      setBusyId(null);
      if (res.status !== "successful") {
        setError(res.message || "Update failed");
        return;
      }
      setError("");
      patchBooking(id, { status });
      await refresh({ soft: true, force: true });
    },
    [patchBooking, refresh],
  );

  const setStatus = useCallback(
    (id: string, status: string) => {
      if (busyId) return;
      const current = bookings.find((b) => b.id === id)?.status;
      if (isFinishedStatus(current)) {
        setError("Completed appointments cannot change status.");
        return;
      }
      const confirm = CONFIRM[status];
      if (!confirm) {
        void apply(id, status);
        return;
      }
      Alert.alert(confirm.title, confirm.body, [
        { text: "Keep", style: "cancel" },
        {
          text: confirm.cta,
          style: "destructive",
          onPress: () => void apply(id, status),
        },
      ]);
    },
    [apply, bookings, busyId],
  );

  return { busyId, error, setError, setStatus };
}
