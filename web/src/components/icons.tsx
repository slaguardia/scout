// Inline SVG icons, lifted verbatim from the vanilla markup/app so glyphs render
// pixel-identical. Each is a tiny component; `className`/`title` pass through.
// Grown per phase as more glyphs are needed.
import type { ReactNode } from "react";

type IconProps = { className?: string; title?: string };

function svg(children: ReactNode, extra?: Partial<Record<string, string>>) {
  return (props: IconProps) => (
    <svg
      viewBox={extra?.viewBox ?? "0 0 16 16"}
      fill="none"
      stroke="currentColor"
      strokeWidth={extra?.strokeWidth ?? "1.5"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden={props.title ? undefined : true}
    >
      {props.title ? <title>{props.title}</title> : null}
      {children}
    </svg>
  );
}

export const IconCompanies = svg(
  <>
    <rect x="3" y="2.5" width="10" height="11.5" rx="1" />
    <path d="M6 5.5h1M9 5.5h1M6 8h1M9 8h1M6 10.5h1M9 10.5h1" />
  </>,
);

export const IconJobs = svg(
  <>
    <rect x="2.5" y="5" width="11" height="8" rx="1.2" />
    <path d="M5.8 5V3.8a1 1 0 011-1h2.4a1 1 0 011 1V5" />
    <path d="M2.5 8.5h11" />
  </>,
);

export const IconBell = svg(
  <>
    <path d="M4.2 7a3.8 3.8 0 0 1 7.6 0c0 3 1.2 4 1.2 4H3s1.2-1 1.2-4z" />
    <path d="M6.7 13a1.5 1.5 0 0 0 2.6 0" />
  </>,
);

export const IconPlus = svg(<path d="M8 3.5v9M3.5 8h9" />);

export const IconEnrich = svg(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12" />
  </>,
);

export const IconVerdict = svg(<path d="M3 8l3 3 7-7" />);

export const IconSearch = svg(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </>,
);

export const IconFilterLead = svg(<path d="M2 4h12M4 8h8M6 12h4" />);

export const IconColumnsLead = svg(<path d="M2.5 3v10M6.5 3v10M10.5 3v10M14 3v10" />);

export const IconChevron = (props: IconProps) => (
  <svg viewBox="0 0 10 6" aria-hidden="true" className={props.className}>
    <path d="M0 0l5 6 5-6z" fill="currentColor" />
  </svg>
);

export const IconGear = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    aria-hidden={props.title ? undefined : true}
  >
    {props.title ? <title>{props.title}</title> : null}
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconHelp = svg(
  <>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 11.5v.01M6.4 6.2a1.6 1.6 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.3" />
  </>,
);

export const IconChat = svg(
  <path d="M2.5 3.5h11a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2.5V11.5H2.5a1 1 0 01-1-1v-6a1 1 0 011-1z" />,
);

export const IconClose = (props: IconProps) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    className={props.className}
    aria-hidden="true"
  >
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </svg>
);

// The flag bookmark glyph — pole first, banner last (the .is-on CSS fills it).
export const IconFlag = svg(
  <>
    <path d="M3.5 14V2.5" />
    <path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z" />
  </>,
);

export const IconInfo = svg(
  <>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 5v3.5M8 11v.5" />
  </>,
);

export const IconNextUp = svg(<path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7" />, { strokeWidth: "2" });

export const IconRefresh = svg(
  <>
    <path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8" />
    <path d="M13.6 2.6V5.2H11" />
  </>,
);

export const IconCopy = svg(
  <>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M2.5 10.5v-7a1 1 0 011-1h7" />
  </>,
);

export const IconSend = svg(
  <>
    <path d="M14 2L7.3 8.7" />
    <path d="M14 2L9.7 14l-2.4-5.3L2 6.3z" />
  </>,
);

export const IconStageCheck = svg(<path d="M3.5 8.5l3 3 6-7" />, { strokeWidth: "2.2" });
