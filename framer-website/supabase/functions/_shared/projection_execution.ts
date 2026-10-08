export type IndependentProjectionResult = {
    sheetLogged: boolean
    masterLogged: boolean
    errors: string[]
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error ?? "Projection failed")
}

/** Run a routed Sheet write and Master Leads write independently. */
export async function runIndependentSheetProjections(
    routedProjection: () => Promise<unknown>,
    masterProjection: () => Promise<unknown>,
): Promise<IndependentProjectionResult> {
    const [routed, master] = await Promise.all([
        Promise.resolve().then(routedProjection).then(
            () => ({ ok: true as const }),
            (error) => ({ ok: false as const, error }),
        ),
        Promise.resolve().then(masterProjection).then(
            () => ({ ok: true as const }),
            (error) => ({ ok: false as const, error }),
        ),
    ])

    return {
        sheetLogged: routed.ok,
        masterLogged: master.ok,
        errors: [routed, master]
            .filter((result): result is { ok: false; error: unknown } => !result.ok)
            .map((result) => errorMessage(result.error)),
    }
}
