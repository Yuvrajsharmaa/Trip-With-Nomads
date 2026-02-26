/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_MCP_URL: string
    readonly VITE_SITE_BASE_URL: string
    readonly VITE_FRAMER_PROJECT_URL: string
    readonly VITE_FRAMER_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
