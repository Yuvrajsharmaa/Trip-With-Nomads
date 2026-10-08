const SHEET_EPOCH_UTC_MS = Date.UTC(1899, 11, 30)
const MILLISECONDS_PER_DAY = 86_400_000
const SHEET_TIME_ZONE = "Asia/Kolkata"

export type SheetDateValue = number | string

function partsByType(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
    return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function dateSerial(year: number, month: number, day: number): number {
    return (Date.UTC(year, month - 1, day) - SHEET_EPOCH_UTC_MS) /
        MILLISECONDS_PER_DAY
}

/** Convert an instant into a numeric Google Sheets date-time in the workbook's IST timezone. */
export function timestampToSheetSerial(value?: unknown): SheetDateValue {
    if (value === null || value === undefined || String(value).trim() === "") return ""
    const raw = value instanceof Date ? value : String(value)
    const instant = value instanceof Date ? value : new Date(raw)
    if (Number.isNaN(instant.getTime())) return String(raw)

    const parts = partsByType(
        new Intl.DateTimeFormat("en-GB", {
            timeZone: SHEET_TIME_ZONE,
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hourCycle: "h23",
        }).formatToParts(instant),
    )
    const year = Number(parts.year)
    const month = Number(parts.month)
    const day = Number(parts.day)
    const hour = Number(parts.hour)
    const minute = Number(parts.minute)
    const second = Number(parts.second)
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
        return String(raw)
    }

    const milliseconds = (((hour * 60 + minute) * 60 + second) * 1000) +
        instant.getUTCMilliseconds()
    return dateSerial(year, month, day) + milliseconds / MILLISECONDS_PER_DAY
}

/** Convert an ISO calendar date into a numeric Google Sheets date without shifting timezones. */
export function dateToSheetSerial(value?: unknown): SheetDateValue {
    if (value === null || value === undefined || String(value).trim() === "") return ""
    const raw = String(value).trim()
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (!match) return raw

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (
        date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) return raw
    return dateSerial(year, month, day)
}

const MONTHS = new Map([
    ["jan", 1],
    ["feb", 2],
    ["mar", 3],
    ["apr", 4],
    ["may", 5],
    ["jun", 6],
    ["jul", 7],
    ["aug", 8],
    ["sep", 9],
    ["oct", 10],
    ["nov", 11],
    ["dec", 12],
])

/** Compare numeric date serials with values returned by Sheets as formatted text. */
export function formattedSheetDateMatches(
    actual: unknown,
    expectedSerial: number,
    dateOnly: boolean,
): boolean {
    const minuteBucket = (serial: number) => Math.floor(serial * 1440 + 1e-7)
    if (typeof actual === "number" && Number.isFinite(actual)) {
        return dateOnly
            ? Math.floor(actual) === Math.floor(expectedSerial)
            : minuteBucket(actual) === minuteBucket(expectedSerial)
    }

    const text = String(actual ?? "").trim().replace(/\s+IST$/i, "")
    const match = /^(\d{1,2})\s+([a-z]{3})\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})\s*(am|pm))?$/i
        .exec(text)
    if (!match) return false
    const month = MONTHS.get(match[2].toLowerCase())
    if (!month) return false
    const actualDay = dateSerial(Number(match[3]), month, Number(match[1]))
    if (dateOnly || !match[4]) {
        return Math.floor(actualDay) === Math.floor(expectedSerial)
    }

    let hour = Number(match[4]) % 12
    if (match[6].toLowerCase() === "pm") hour += 12
    const minuteOfDay = hour * 60 + Number(match[5])
    const expectedMinuteOfDay = Math.floor(
        (expectedSerial - Math.floor(expectedSerial)) * 1440 + 1e-7,
    )
    return Math.floor(actualDay) === Math.floor(expectedSerial) &&
        minuteOfDay === expectedMinuteOfDay
}
