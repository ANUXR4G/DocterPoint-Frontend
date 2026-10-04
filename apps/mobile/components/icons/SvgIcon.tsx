import Svg, {
  Circle,
  Line,
  Path,
  Polyline,
  Rect,
} from "react-native-svg";

export type SvgIconName =
  | "home"
  | "homeOutline"
  | "medkit"
  | "medkitOutline"
  | "calendar"
  | "calendarOutline"
  | "person"
  | "personOutline"
  | "chevronLeft"
  | "chevronRight"
  | "close"
  | "chat"
  | "chatOutline"
  | "logout"
  | "camera"
  | "help"
  | "search"
  | "star"
  | "location"
  | "checkDone"
  | "ticket"
  | "mic"
  | "stop"
  | "clock"
  | "addCircle"
  | "edit"
  | "trash"
  | "business";

type Props = {
  name: SvgIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

/** Stroke SVG icons (24×24 Lucide-style) — sharp on all densities, no icon font. */
export function SvgIcon({
  name,
  size = 24,
  color = "#0F1B24",
  strokeWidth = 1.75,
}: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "home":
      return (
        <Svg {...common}>
          <Path
            d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"
            fill={color}
            stroke="none"
          />
        </Svg>
      );
    case "homeOutline":
      return (
        <Svg {...common}>
          <Path d="M3 10.5 12 3l9 7.5" />
          <Path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
        </Svg>
      );
    case "medkit":
      return (
        <Svg {...common}>
          <Path
            d="M18 8h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1"
            fill={color}
            stroke="none"
          />
          <Path
            d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            fill={color}
            stroke="none"
          />
          <Line x1="12" y1="12" x2="12" y2="18" stroke="#fff" strokeWidth={2} />
          <Line x1="9" y1="15" x2="15" y2="15" stroke="#fff" strokeWidth={2} />
        </Svg>
      );
    case "medkitOutline":
      return (
        <Svg {...common}>
          <Path d="M18 8h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1" />
          <Path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <Line x1="12" y1="12" x2="12" y2="18" />
          <Line x1="9" y1="15" x2="15" y2="15" />
        </Svg>
      );
    case "calendar":
      return (
        <Svg {...common}>
          <Rect x="3" y="4" width="18" height="18" rx="2" fill={color} stroke="none" />
          <Line x1="16" y1="2" x2="16" y2="6" stroke="#fff" strokeWidth={2} />
          <Line x1="8" y1="2" x2="8" y2="6" stroke="#fff" strokeWidth={2} />
          <Line x1="3" y1="10" x2="21" y2="10" stroke="#fff" strokeWidth={1.5} />
        </Svg>
      );
    case "calendarOutline":
      return (
        <Svg {...common}>
          <Rect x="3" y="4" width="18" height="18" rx="2" />
          <Line x1="16" y1="2" x2="16" y2="6" />
          <Line x1="8" y1="2" x2="8" y2="6" />
          <Line x1="3" y1="10" x2="21" y2="10" />
        </Svg>
      );
    case "person":
      return (
        <Svg {...common}>
          <Circle cx="12" cy="8" r="4" fill={color} stroke="none" />
          <Path
            d="M4 20a8 8 0 0 1 16 0"
            fill={color}
            stroke="none"
          />
        </Svg>
      );
    case "personOutline":
      return (
        <Svg {...common}>
          <Circle cx="12" cy="8" r="4" />
          <Path d="M4 20a8 8 0 0 1 16 0" />
        </Svg>
      );
    case "chevronLeft":
      return (
        <Svg {...common}>
          <Polyline points="15 18 9 12 15 6" />
        </Svg>
      );
    case "chevronRight":
      return (
        <Svg {...common}>
          <Polyline points="9 18 15 12 9 6" />
        </Svg>
      );
    case "close":
      return (
        <Svg {...common}>
          <Line x1="18" y1="6" x2="6" y2="18" />
          <Line x1="6" y1="6" x2="18" y2="18" />
        </Svg>
      );
    case "chat":
      return (
        <Svg {...common}>
          <Path
            d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"
            fill={color}
            stroke="none"
          />
        </Svg>
      );
    case "chatOutline":
      return (
        <Svg {...common}>
          <Path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
          <Circle cx="8" cy="12" r="0.9" fill={color} stroke="none" />
          <Circle cx="12" cy="12" r="0.9" fill={color} stroke="none" />
          <Circle cx="16" cy="12" r="0.9" fill={color} stroke="none" />
        </Svg>
      );
    case "logout":
      return (
        <Svg {...common}>
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <Polyline points="16 17 21 12 16 7" />
          <Line x1="21" y1="12" x2="9" y2="12" />
        </Svg>
      );
    case "camera":
      return (
        <Svg {...common}>
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <Circle cx="12" cy="13" r="4" />
        </Svg>
      );
    case "help":
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M9.1 9a3 3 0 1 1 4.8 2.4c-.8.6-1.4 1.1-1.4 2.1V14" />
          <Circle cx="12" cy="17" r="0.8" fill={color} stroke="none" />
        </Svg>
      );
    case "search":
      return (
        <Svg {...common}>
          <Circle cx="11" cy="11" r="7" />
          <Line x1="16.5" y1="16.5" x2="21" y2="21" />
        </Svg>
      );
    case "star":
      return (
        <Svg {...common}>
          <Path
            d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 18.4l.9-5.4L4.2 9.2l5.4-.8L12 3.5Z"
            fill={color}
            stroke="none"
          />
        </Svg>
      );
    case "location":
      return (
        <Svg {...common}>
          <Path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
          <Circle cx="12" cy="10" r="2.5" />
        </Svg>
      );
    case "checkDone":
      return (
        <Svg {...common}>
          <Polyline points="2 12 6 16 14 6" />
          <Polyline points="10 16 12 18 22 6" />
        </Svg>
      );
    case "ticket":
      return (
        <Svg {...common}>
          <Path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 3V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-3V9Z" />
          <Line x1="9" y1="7" x2="9" y2="17" />
        </Svg>
      );
    case "mic":
      return (
        <Svg {...common}>
          <Path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <Path d="M19 10v1a7 7 0 0 1-14 0v-1" />
          <Line x1="12" y1="19" x2="12" y2="22" />
        </Svg>
      );
    case "stop":
      return (
        <Svg {...common}>
          <Rect x="6" y="6" width="12" height="12" rx="2" fill={color} stroke="none" />
        </Svg>
      );
    case "clock":
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Polyline points="12 7 12 12 15.5 14" />
        </Svg>
      );
    case "addCircle":
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Line x1="12" y1="8" x2="12" y2="16" />
          <Line x1="8" y1="12" x2="16" y2="12" />
        </Svg>
      );
    case "edit":
      return (
        <Svg {...common}>
          <Path d="M12 20h9" />
          <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
        </Svg>
      );
    case "trash":
      return (
        <Svg {...common}>
          <Polyline points="3 6 5 6 21 6" />
          <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <Line x1="10" y1="11" x2="10" y2="17" />
          <Line x1="14" y1="11" x2="14" y2="17" />
        </Svg>
      );
    case "business":
      return (
        <Svg {...common}>
          <Rect x="4" y="3" width="16" height="18" rx="1.5" />
          <Line x1="9" y1="7" x2="9" y2="7.01" />
          <Line x1="12" y1="7" x2="12" y2="7.01" />
          <Line x1="15" y1="7" x2="15" y2="7.01" />
          <Line x1="9" y1="11" x2="9" y2="11.01" />
          <Line x1="12" y1="11" x2="12" y2="11.01" />
          <Line x1="15" y1="11" x2="15" y2="11.01" />
          <Path d="M9 21v-4h6v4" />
        </Svg>
      );
    default:
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="9" />
        </Svg>
      );
  }
}
