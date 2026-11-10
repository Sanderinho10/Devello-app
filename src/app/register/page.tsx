import { redirect } from "next/navigation";

/** /register har ingen egen side: første fane er kontaktene. */
export default function RegisterPage() {
  redirect("/register/kontakter");
}
