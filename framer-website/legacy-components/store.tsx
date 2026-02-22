import { Data } from "framer"

export const store = Data({
    id: Math.random().toString(36).substr(2, 5), // Debug ID
    price: "...",
    formData: {}
})
