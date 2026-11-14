type IconName =
  | "chart"
  | "data"
  | "clock"
  | "select"
  | "close"
  | "play"
  | "pause"
  | "arrow"
  | "help";
export function GuideIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    chart: "M4 4v16h16M7 14l4-5 4 3 5-8",
    data: "M4 5h16v14H4zM4 10h16M10 5v14",
    clock: "M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    select: "M12 2v5m0 10v5M2 12h5m10 0h5M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0",
    close: "m6 6 12 12M18 6 6 18",
    play: "m8 5 11 7-11 7z",
    pause: "M8 5v14M16 5v14",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
