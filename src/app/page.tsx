import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default function Home() {
  redirect(getCurrentUser() ? "/dashboard" : "/login");
}
