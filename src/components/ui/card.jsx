import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export const Card = forwardRef(function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("rounded-2xl border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
});

export const CardHeader = forwardRef(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
});

export const CardTitle = forwardRef(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn("text-base font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  );
});

export const CardDescription = forwardRef(function CardDescription({ className, ...props }, ref) {
  return (
    <p ref={ref} className={cn("text-xs uppercase tracking-wide text-muted-foreground", className)} {...props} />
  );
});

export const CardContent = forwardRef(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn("px-5 pb-5", className)} {...props} />;
});

export const CardFooter = forwardRef(function CardFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn("flex items-center px-5 pb-5 pt-0", className)} {...props} />;
});
