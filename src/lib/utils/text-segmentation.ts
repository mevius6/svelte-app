export type TextInput = string | string[] | null | undefined;
export type SplitBy = "lines" | "words" | "chars";

export type TextSegment = {
  value: string;
  i: number;
};

export type SegmentTextOptions = {
  splitBy?: SplitBy;
};

const DEFAULT_OPTIONS: Required<SegmentTextOptions> = {
  splitBy: "chars"
};

const WORD_OR_WHITESPACE_RE = /\S+|\s+/gu;

const normalizeText = (text: TextInput): string => {
  if (!text) return "";
  const raw = Array.isArray(text) ? text.join("\n") : text;
  return raw.replace(/\r\n?/g, "\n");
};

const splitByLines = (text: string): string[] => {
  if (text.length === 0) return [];

  const lines = text.split("\n");
  const hasTrailingBreak = text.endsWith("\n");

  return lines
    .map((line, index) => {
      const isLast = index === lines.length - 1;
      if (isLast && !hasTrailingBreak) return line;
      return `${line}\n`;
    })
    .filter((line) => line.length > 0);
};

const splitByWords = (text: string): string[] => text.match(WORD_OR_WHITESPACE_RE) ?? [];

const splitByChars = (text: string): string[] => Array.from(text);

export const segmentText = (
  text: TextInput,
  options: SegmentTextOptions = DEFAULT_OPTIONS
): TextSegment[] => {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const normalized = normalizeText(text);

  let values: string[];
  if (settings.splitBy === "lines") values = splitByLines(normalized);
  else if (settings.splitBy === "words") values = splitByWords(normalized);
  else values = splitByChars(normalized);

  return values.map((value, i) => ({ value, i }));
};
