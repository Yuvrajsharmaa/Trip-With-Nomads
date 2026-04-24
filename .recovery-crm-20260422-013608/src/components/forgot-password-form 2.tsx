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

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        toast.error("Error", {
          description: error.message,
        })
        return
      }

      toast.success("Check your email", {
        description: "We've sent you a password reset link.",
      })
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
          <CardTitle className="text-xl font-bold tracking-tight text-foreground">Reset Password</CardTitle>
          <CardDescription className="text-xs font-medium text-muted-foreground">
            Enter your email to receive a password reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email" className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest pl-0.5">Email Address</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary rounded-xl font-medium"
                />
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 font-bold uppercase text-[10px] tracking-widest transition-all rounded-xl shadow-lg">
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Button>
              </Field>
              <div className="text-center text-sm pt-2">
                <a href="/login" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-foreground transition-colors">
                  Back to login
                </a>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
