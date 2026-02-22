import { ComponentType, useState, useEffect } from "react"
import { store } from "./store.tsx"

export function PriceDisplay(Component: ComponentType): ComponentType {
    return (props) => {
        // Local state to force re-render
        const [displayPrice, setDisplayPrice] = useState(store.price)

        useEffect(() => {
            // Event Listener Strategy: Only update when Calculator tells us to
            const handleUpdate = () => {
                console.log("⚡ UI Event Recieved:", store.price)
                setDisplayPrice(store.price)
            }

            window.addEventListener("PRICE_UPDATED", handleUpdate)
            return () => window.removeEventListener("PRICE_UPDATED", handleUpdate)
        }, [])

        // Pass to text prop (standard) and children (fallback)
        // Use 'as any' to silence TypeScript errors about 'text' prop
        return <Component {...props} text={store.price} />
    }
}
