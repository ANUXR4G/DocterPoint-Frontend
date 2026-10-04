import { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SvgIcon } from "@/components/icons/SvgIcon";
import {
  addMonths,
  formatDayTitle,
  formatMonthTitle,
  isSameDay,
  isSameMonth,
  monthGridDays,
  startOfDay,
  ymd,
} from "@/lib/calendarDates";
import { bookingWhenMs } from "@/lib/bookingStats";
import { withDrTitle } from "@/lib/doctorName";
import { bookingWhen, type ProctoBooking } from "@/lib/types";
import { formatPracticeTime } from "@/lib/practiceTime";
import { colors, radii, shadows, space } from "@/lib/theme";

type Props = {
  bookings: ProctoBooking[];
  onOpenBooking: (id: string) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLS = 7;
const CELL_GAP = 4;
const CELL_MIN_H = 52;

function bookingDayKey(b: ProctoBooking): string | null {
  const ms = bookingWhenMs(b);
  if (!ms) return null;
  return ymd(new Date(ms));
}

function timeLabel(b: ProctoBooking): string {
  const slot = b.slotStart ?? b.slot_start;
  if (slot) {
    return formatPracticeTime(slot);
  }
  const token = b.tokenNumber ?? b.token_number;
  if (token != null) return `#${token}`;
  return "—";
}

function statusTone(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED") return { bg: colors.emeraldLight, fg: colors.success };
  if (s === "IN_PROGRESS") return { bg: colors.amberLight, fg: "#b45309" };
  if (s === "WAITING" || s === "CHECKED_IN")
    return { bg: colors.brandLight, fg: colors.brand };
  if (s === "ACCEPTED" || s === "CONFIRMED")
    return { bg: colors.brandMist, fg: colors.brand };
  if (s === "CANCELED" || s === "CANCELLED" || s === "NO_SHOW")
    return { bg: colors.roseLight, fg: colors.danger };
  // Scheduled / upcoming
  return { bg: colors.amberLight, fg: "#CA8A04" };
}

/** Calendar tile colors by booking status. */
const CELL_STATUS = {
  completed: { bg: colors.success, fg: colors.white },
  scheduled: { bg: "#EAB308", fg: colors.ink },
  cancelled: { bg: colors.danger, fg: colors.white },
} as const;

function isCancelledStatus(status: string) {
  const s = (status || "").toUpperCase();
  return s === "CANCELED" || s === "CANCELLED" || s === "NO_SHOW";
}

function isCompletedStatus(status: string) {
  return (status || "").toUpperCase() === "COMPLETED";
}

/** Pick one tile color when a day has mixed statuses (scheduled > cancelled > completed). */
function dayCellStatusColor(list: ProctoBooking[]) {
  const hasScheduled = list.some(
    (b) => !isCompletedStatus(b.status) && !isCancelledStatus(b.status),
  );
  if (hasScheduled) return CELL_STATUS.scheduled;
  if (list.some((b) => isCancelledStatus(b.status))) return CELL_STATUS.cancelled;
  return CELL_STATUS.completed;
}


function chunkWeeks<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function BookingRow({
  booking,
  onPress,
}: {
  booking: ProctoBooking;
  onPress: () => void;
}) {
  const tone = statusTone(booking.status);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bookingCard, pressed && { opacity: 0.88 }]}
    >
      <View style={[styles.statusDot, { backgroundColor: tone.fg }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.bookingTitle} numberOfLines={1}>
          {booking.practice?.name || "Clinic visit"}
        </Text>
        <Text style={styles.bookingMeta} numberOfLines={1}>
          {timeLabel(booking)}
          {booking.provider?.name ? ` · ${withDrTitle(booking.provider.name)}` : ""}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.statusPillText, { color: tone.fg }]}>
          {(booking.status || "").replace(/_/g, " ")}
        </Text>
      </View>
      <SvgIcon name="chevronRight" size={16} color={colors.inkFaint} />
    </Pressable>
  );
}

export function CareCalendar({ bookings, onOpenBooking }: Props) {
  const [monthCursor, setMonthCursor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<Date | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const byDay = useMemo(() => {
    const map = new Map<string, ProctoBooking[]>();
    for (const b of bookings) {
      const key = bookingDayKey(b);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    for (const [k, list] of map) {
      map.set(
        k,
        [...list].sort((a, b) => bookingWhenMs(a) - bookingWhenMs(b)),
      );
    }
    return map;
  }, [bookings]);

  const monthDays = useMemo(() => monthGridDays(monthCursor), [monthCursor]);
  const monthRows = useMemo(() => chunkWeeks(monthDays, COLS), [monthDays]);
  const dayKey = selected ? ymd(selected) : null;
  const dayBookings = dayKey ? (byDay.get(dayKey) ?? []) : [];

  const cellWidth =
    gridWidth > 0
      ? Math.floor((gridWidth - CELL_GAP * (COLS - 1)) / COLS)
      : 0;

  function onGridLayout(e: LayoutChangeEvent) {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== gridWidth) setGridWidth(w);
  }

  function goMonth(dir: -1 | 1) {
    setMonthCursor((d) => addMonths(d, dir));
    setSelected(null);
  }

  function goCurrentMonth() {
    setMonthCursor(startOfDay(new Date()));
    setSelected(null);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <View style={styles.navRow}>
          <Pressable
            onPress={() => goMonth(-1)}
            style={styles.navBtn}
            hitSlop={8}
          >
            <SvgIcon name="chevronLeft" size={20} color={colors.ink} />
          </Pressable>
          <Pressable onPress={goCurrentMonth} style={styles.monthBtn}>
            <Text style={styles.monthBtnText}>Month</Text>
          </Pressable>
          <Pressable
            onPress={() => goMonth(1)}
            style={styles.navBtn}
            hitSlop={8}
          >
            <SvgIcon name="chevronRight" size={20} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {formatMonthTitle(monthCursor)}
        </Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendSwatch,
                { backgroundColor: CELL_STATUS.scheduled.bg },
              ]}
            />
            <Text style={styles.legendText}>Upcoming</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendSwatch,
                { backgroundColor: CELL_STATUS.cancelled.bg },
              ]}
            />
            <Text style={styles.legendText}>Cancelled</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendSwatch,
                { backgroundColor: CELL_STATUS.completed.bg },
              ]}
            />
            <Text style={styles.legendText}>Completed</Text>
          </View>
        </View>
      </View>

      <View style={styles.monthCard}>
        <View style={styles.weekdayHeader} onLayout={onGridLayout}>
          {WEEKDAY_LABELS.map((label) => (
            <View
              key={label}
              style={[
                styles.weekdayCol,
                cellWidth > 0 ? { width: cellWidth } : styles.weekdayColFlex,
              ]}
            >
              <Text style={styles.weekdayLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {cellWidth > 0
          ? monthRows.map((row, rowIdx) => (
              <View key={`row-${rowIdx}`} style={styles.monthRow}>
                {row.map((d, colIdx) => {
                  const key = ymd(d);
                  const list = byDay.get(key) ?? [];
                  const inMonth = isSameMonth(d, monthCursor);
                  const today = isSameDay(d, new Date());
                  const isSelected = selected ? isSameDay(d, selected) : false;
                  const hasBooking = list.length > 0;
                  const statusColor = hasBooking
                    ? dayCellStatusColor(list)
                    : null;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setSelected(startOfDay(d))}
                      style={[
                        styles.dayCell,
                        {
                          width: cellWidth,
                          marginRight: colIdx < COLS - 1 ? CELL_GAP : 0,
                        },
                        !inMonth && styles.dayCellMuted,
                        today &&
                          !hasBooking &&
                          !isSelected &&
                          styles.dayCellToday,
                        isSelected &&
                          !hasBooking &&
                          styles.dayCellSelectedEmpty,
                        statusColor
                          ? { backgroundColor: statusColor.bg }
                          : null,
                        isSelected &&
                          hasBooking &&
                          styles.dayCellBookedSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          !inMonth && styles.dayNumMuted,
                          today &&
                            !hasBooking &&
                            !isSelected &&
                            styles.dayNumToday,
                          isSelected &&
                            !hasBooking &&
                            styles.dayNumSelectedEmpty,
                          statusColor ? { color: statusColor.fg } : null,
                        ]}
                      >
                        {d.getDate()}
                      </Text>
                      {hasBooking && statusColor ? (
                        <View style={styles.dotsRow}>
                          {list.slice(0, 3).map((b) => (
                            <View
                              key={b.id}
                              style={[
                                styles.eventDot,
                                {
                                  backgroundColor:
                                    statusColor.fg === colors.ink
                                      ? "rgba(9,14,23,0.45)"
                                      : "rgba(255,255,255,0.9)",
                                },
                              ]}
                            />
                          ))}
                          {list.length > 3 ? (
                            <Text
                              style={[
                                styles.cellMoreBooked,
                                { color: statusColor.fg },
                              ]}
                            >
                              +{list.length - 3}
                            </Text>
                          ) : null}
                        </View>
                      ) : (
                        <View style={styles.dotsPlaceholder} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))
          : null}
      </View>

      {selected ? (
        <View style={styles.dayCard}>
          <Text style={styles.daySectionLabel}>
            {formatDayTitle(selected)}
            {dayBookings.length
              ? ` · ${dayBookings.length} visit${dayBookings.length === 1 ? "" : "s"}`
              : ""}
          </Text>
          {dayBookings.length === 0 ? (
            <Text style={styles.emptyDayDetail}>
              No visits on this date. Tap a colored date to see your bookings.
            </Text>
          ) : (
            dayBookings.map((b) => (
              <View key={b.id} style={styles.dayBookingWrap}>
                <BookingRow booking={b} onPress={() => onOpenBooking(b.id)} />
                <Text style={styles.whenHint}>{bookingWhen(b)}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  toolbar: {
    gap: space.lg,
    alignItems: "center",
    paddingVertical: space.sm,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  monthBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  monthBtnText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 13,
  },
  title: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
    paddingVertical: 2,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 14,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  monthCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.md,
    ...shadows.soft,
  },
  weekdayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  weekdayCol: {
    alignItems: "center",
    justifyContent: "center",
  },
  weekdayColFlex: {
    flex: 1,
  },
  weekdayLabel: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: colors.inkFaint,
    letterSpacing: 0.2,
  },
  monthRow: {
    flexDirection: "row",
    marginBottom: CELL_GAP,
  },
  dayCell: {
    height: CELL_MIN_H,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  dayCellMuted: {
    backgroundColor: "transparent",
    opacity: 0.4,
  },
  dayCellToday: {
    backgroundColor: colors.brandLight,
  },
  dayCellSelectedEmpty: {
    backgroundColor: colors.ink,
  },
  dayCellBookedSelected: {
    borderWidth: 2,
    borderColor: colors.navy,
  },
  dayNum: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
    lineHeight: 18,
  },
  dayNumMuted: { color: colors.inkFaint },
  dayNumToday: { color: colors.brand },
  dayNumSelectedEmpty: { color: colors.white },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    marginTop: 4,
    minHeight: 8,
  },
  dotsPlaceholder: {
    marginTop: 4,
    height: 8,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  cellMoreBooked: {
    fontSize: 8,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
  },
  dayCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    ...shadows.soft,
  },
  daySectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: space.md,
  },
  emptyDayDetail: {
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  dayBookingWrap: { marginBottom: space.md },
  whenHint: {
    marginTop: 6,
    marginLeft: 18,
    fontSize: 12,
    color: colors.inkFaint,
  },
  bookingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.sky50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bookingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  bookingMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
