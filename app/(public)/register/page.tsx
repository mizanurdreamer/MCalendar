"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { registerSchema, type RegisterDTO } from "@/dto/auth.dto";
import { useRegister } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";

export default function RegisterPage() {
  const registerMutation = useRegister();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterDTO>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: "CLIENT" },
  });

  const role = watch("role");
  const onSubmit = (values: RegisterDTO) => registerMutation.mutate(values);
  const serverError =
    registerMutation.error instanceof ApiError
      ? registerMutation.error.message
      : registerMutation.error
        ? "Registration failed"
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>Join bookingCalendar as a client or cleaner</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {serverError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-xs text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...register("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>I am a…</Label>
            <Select
              value={role}
              onValueChange={(v) => setValue("role", v as RegisterDTO["role"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLIENT">Client</SelectItem>
                <SelectItem value="CLEANER">Cleaner</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
            {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create account
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
