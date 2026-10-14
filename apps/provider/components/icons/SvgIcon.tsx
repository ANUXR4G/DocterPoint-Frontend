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
  | "list"
  | "listOutline"
  | "calendar"
  | "calendarOutline"
  | "calendarNumber"
  | "calendarNumberOutline"
  | "people"
  | "peopleOutline"
  | "chart"
  | "chartOutline"
  | "more"
  | "moreOutline"
  | "person"
  | "chevronLeft"
  | "chevronRight"
  | "close"
  | "chat"
  | "chatOutline"
  | "logout"
  | "camera"
  | "medkit"
  | "document"
  | "card"
  | "clock"
  | "diamond"
  | "settings"
  | "help"
  | "open"
  | "bell"
  | "mic"
  | "stop"
  | "menu";

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
          <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" fill={color} stroke="none" />
        </Svg>
      );
    case "homeOutline":
      return (
        <Svg {...common}>
          <Path d="M3 10.5 12 3l9 7.5" />
          <Path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
        </Svg>
      );
    case "list":
      return (
        <Svg {...common}>
          <Line x1="8" y1="6" x2="21" y2="6" />
          <Line x1="8" y1="12" x2="21" y2="12" />
          <Line x1="8" y1="18" x2="21" y2="18" />
          <Circle cx="4" cy="6" r="1.2" fill={color} stroke="none" />
          <Circle cx="4" cy="12" r="1.2" fill={color} stroke="none" />
          <Circle cx="4" cy="18" r="1.2" fill={color} stroke="none" />
        </Svg>
      );
    case "listOutline":
      return (
        <Svg {...common}>
          <Line x1="8" y1="6" x2="21" y2="6" />
          <Line x1="8" y1="12" x2="21" y2="12" />
          <Line x1="8" y1="18" x2="21" y2="18" />
          <Circle cx="4" cy="6" r="1" />
          <Circle cx="4" cy="12" r="1" />
          <Circle cx="4" cy="18" r="1" />
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
    case "calendarNumber":
      return (
        <Svg {...common}>
          <Rect x="3" y="4" width="18" height="18" rx="2" fill={color} stroke="none" />
          <Line x1="16" y1="2" x2="16" y2="6" stroke="#fff" strokeWidth={2} />
          <Line x1="8" y1="2" x2="8" y2="6" stroke="#fff" strokeWidth={2} />
          <Line x1="3" y1="10" x2="21" y2="10" stroke="#fff" strokeWidth={1.5} />
          <Rect x="8" y="13" width="3.2" height="3.2" rx="0.6" fill="#fff" stroke="none" />
          <Rect x="12.8" y="13" width="3.2" height="3.2" rx="0.6" fill="#fff" stroke="none" />
          <Rect x="8" y="17.2" width="3.2" height="3.2" rx="0.6" fill="#fff" stroke="none" />
        </Svg>
      );
    case "calendarNumberOutline":
      return (
        <Svg {...common}>
          <Rect x="3" y="4" width="18" height="18" rx="2" />
          <Line x1="16" y1="2" x2="16" y2="6" />
          <Line x1="8" y1="2" x2="8" y2="6" />
          <Line x1="3" y1="10" x2="21" y2="10" />
          <Rect x="8" y="13" width="3.2" height="3.2" rx="0.6" />
          <Rect x="12.8" y="13" width="3.2" height="3.2" rx="0.6" />
          <Rect x="8" y="17.2" width="3.2" height="3.2" rx="0.6" />
        </Svg>
      );
    case "people":
      return (
        <Svg {...common}>
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" fill={color} stroke="none" />
          <Circle cx="9" cy="7" r="4" fill={color} stroke="none" />
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </Svg>
      );
    case "peopleOutline":
      return (
        <Svg {...common}>
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <Circle cx="9" cy="7" r="4" />
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </Svg>
      );
    case "chart":
      return (
        <Svg {...common}>
          <Line x1="18" y1="20" x2="18" y2="10" strokeWidth={2.5} />
          <Line x1="12" y1="20" x2="12" y2="4" strokeWidth={2.5} />
          <Line x1="6" y1="20" x2="6" y2="14" strokeWidth={2.5} />
        </Svg>
      );
    case "chartOutline":
      return (
        <Svg {...common}>
          <Line x1="18" y1="20" x2="18" y2="10" />
          <Line x1="12" y1="20" x2="12" y2="4" />
          <Line x1="6" y1="20" x2="6" y2="14" />
        </Svg>
      );
    case "person":
      return (
        <Svg {...common}>
          <Circle cx="12" cy="8" r="3.2" />
          <Path d="M5.5 19.5c1.4-3.2 3.7-4.8 6.5-4.8s5.1 1.6 6.5 4.8" />
        </Svg>
      );
    case "more":
      return (
        <Svg {...common}>
          <Circle cx="6" cy="12" r="1.6" fill={color} stroke="none" />
          <Circle cx="12" cy="12" r="1.6" fill={color} stroke="none" />
          <Circle cx="18" cy="12" r="1.6" fill={color} stroke="none" />
        </Svg>
      );
    case "moreOutline":
      return (
        <Svg {...common}>
          <Circle cx="6" cy="12" r="1.25" />
          <Circle cx="12" cy="12" r="1.25" />
          <Circle cx="18" cy="12" r="1.25" />
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
    case "medkit":
      return (
        <Svg {...common}>
          <Path d="M18 8h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1" />
          <Path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <Line x1="12" y1="12" x2="12" y2="18" />
          <Line x1="9" y1="15" x2="15" y2="15" />
        </Svg>
      );
    case "document":
      return (
        <Svg {...common}>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline points="14 2 14 8 20 8" />
          <Line x1="8" y1="13" x2="16" y2="13" />
          <Line x1="8" y1="17" x2="13" y2="17" />
        </Svg>
      );
    case "card":
      return (
        <Svg {...common}>
          <Rect x="2" y="5" width="20" height="14" rx="2" />
          <Line x1="2" y1="10" x2="22" y2="10" />
        </Svg>
      );
    case "clock":
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Polyline points="12 7 12 12 15.5 14" />
        </Svg>
      );
    case "diamond":
      return (
        <Svg {...common}>
          <Path d="M2.7 10.3 12 21l9.3-10.7L16 3H8L2.7 10.3Z" />
          <Path d="M2.7 10.3h18.6" />
          <Path d="M8 3 12 10.3 16 3" />
        </Svg>
      );
    case "settings":
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="3" />
          <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H10a1.7 1.7 0 0 0 1-1.5V5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V10c.3.6.9 1 1.6 1H19a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
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
    case "open":
      return (
        <Svg {...common}>
          <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <Polyline points="15 3 21 3 21 9" />
          <Line x1="10" y1="14" x2="21" y2="3" />
        </Svg>
      );
    case "bell":
      return (
        <Svg {...common}>
          <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path d="M13.7 21a2 2 0 0 1-3.4 0" />
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
    case "menu":
      return (
        <Svg {...common}>
          <Line x1="4" y1="7" x2="20" y2="7" />
          <Line x1="4" y1="12" x2="20" y2="12" />
          <Line x1="4" y1="17" x2="20" y2="17" />
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
