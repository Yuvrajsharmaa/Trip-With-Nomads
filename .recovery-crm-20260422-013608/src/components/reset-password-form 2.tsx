"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        toast.error("Error", {
          description: error.message,
        })
        return
      }

      toast.success("Password updated", {
        description: "Your password has been reset successfully.",
      })
      router.push("/login")
    } catch (err) {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border shadow-none bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold tracking-tight text-foreground">Set New Password</CardTitle>
          <CardDescription className="text-xs font-medium text-muted-foreground">
            Choose a strong password to secure your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="password" className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest pl-0.5">New Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password" className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest pl-0.5">Confirm Password</FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-10 border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
                />
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 font-bold uppercase text-[10px] tracking-widest transition-all rounded-xl shadow-lg">
                  {isLoading ? "Updating..." : "Update Password"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
