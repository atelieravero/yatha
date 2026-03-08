/**
 * Shared utility for parsing fuzzy temporal strings into strict Date bounds.
 * Used by both the frontend (for live previews) and the backend (for database saves).
 */
export function parseFuzzyTemporal(fuzzyDateStr?: string | null): { notEarlierThan?: Date, notLaterThan?: Date } {
  if (!fuzzyDateStr) return {};
  
  try {
    const str = fuzzyDateStr.toLowerCase().trim();
    let parts: string[];
    
    // Support range inputs, including open-ended "1988-"
    if (str.includes('~')) {
      parts = str.split('~').map(s => s.trim());
    } else if (str.match(/^-?\d{1,4}-$/)) {
      parts = [str.slice(0, -1), ""]; // Split into ["1988", ""]
    } else {
      parts = [str];
    }

    // Helper: Safely generate exact UTC dates while bypassing JS's annoying 1900-1999 assumption
    const createUTC = (y: number, m: number, d: number, isEnd: boolean) => {
      const date = new Date(Date.UTC(y, m, d, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0));
      if (y >= 0 && y < 100) date.setUTCFullYear(y); // Force the year to stay 0-99
      return date;
    };
    
    const parsePart = (p: string, isStart: boolean): Date | null | undefined => {
      if (!p || p === '?') return null; // Interpreted as open/unknown boundary

      // 1. Century (e.g., "17th century", "1st century")
      const centuryMatch = p.match(/^(\d+)(st|nd|rd|th)?\s*century$/);
      if (centuryMatch) {
        const century = parseInt(centuryMatch[1]);
        const startYear = (century - 1) * 100 + 1; // e.g. 17th -> 1601
        const endYear = century * 100;             // e.g. 17th -> 1700
        return isStart ? createUTC(startYear, 0, 1, false) : createUTC(endYear, 11, 31, true);
      }

      // 2. Decade (e.g., "1980s")
      const decadeMatch = p.match(/^(\d{3,4})s$/);
      if (decadeMatch) {
        const decade = parseInt(decadeMatch[1]);
        return isStart ? createUTC(decade, 0, 1, false) : createUTC(decade + 9, 11, 31, true);
      }

      // 3. Strict ISO-ish formats (YYYY, YYYY-MM, YYYY-MM-DD)
      const dateMatch = p.match(/^(-?(?:0|[1-9]\d{0,3}))(?:-(0?[1-9]|1[0-2]))?(?:-(0?[1-9]|[12]\d|3[01]))?$/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        const month = dateMatch[2] ? parseInt(dateMatch[2]) - 1 : undefined;
        const day = dateMatch[3] ? parseInt(dateMatch[3]) : undefined;
        
        // App-crash defense
        if (year > 10000 || year < -10000) return undefined;
        
        if (month === undefined) {
          return isStart ? createUTC(year, 0, 1, false) : createUTC(year, 11, 31, true);
        } else if (day === undefined) {
          if (month < 0 || month > 11) return undefined;
          
          let tmp = new Date(Date.UTC(year, month + 1, 0));
          if (year >= 0 && year < 100) tmp.setUTCFullYear(year);
          const lastDay = tmp.getUTCDate();
          
          return isStart ? createUTC(year, month, 1, false) : createUTC(year, month, lastDay, true);
        } else {
          if (month < 0 || month > 11 || day < 1 || day > 31) return undefined;
          return isStart ? createUTC(year, month, day, false) : createUTC(year, month, day, true);
        }
      }

      return undefined;
    };

    let notEarlierThan: Date | undefined = undefined;
    let notLaterThan: Date | undefined = undefined;

    if (parts.length === 1) {
       const start = parsePart(parts[0], true);
       const end = parsePart(parts[0], false);
       
       if (start === undefined || end === undefined) return {};
       
       notEarlierThan = start === null ? undefined : start;
       notLaterThan = end === null ? undefined : end;
    } else if (parts.length === 2) {
       const start = parsePart(parts[0], true);
       const end = parsePart(parts[1], false);
       
       if (start === undefined || end === undefined) return {};
       
       notEarlierThan = start === null ? undefined : start;
       notLaterThan = end === null ? undefined : end;
    }

    if (notEarlierThan && notLaterThan && notEarlierThan.getTime() > notLaterThan.getTime()) {
      return {}; 
    }

    return { notEarlierThan, notLaterThan };
  } catch (e) {
    console.error("Temporal parsing failed", e);
  }
  return {};
}