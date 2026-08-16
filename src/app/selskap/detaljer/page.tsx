import { CompanyForm } from "./CompanyForm";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { ToneSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DetaljerPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: brand }, { data: me }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "name, org_nr, billing_address_line, billing_postal_code, billing_city, tone_settings",
      )
      .eq("id", session!.companyId)
      .single(),
    supabase
      .from("company_brand")
      .select("*")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
  ]);

  const tone = (company?.tone_settings ?? {}) as ToneSettings;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Selskapsdetaljer</h1>
          <p className="page-subtitle">
            Firmaopplysninger, adresse og profilen agentene bruker på tilbudene.
          </p>
        </div>
      </div>

      <CompanyForm
        company={{
          name: company?.name ?? "",
          org_nr: company?.org_nr ?? "",
          billing_address_line: company?.billing_address_line ?? "",
          billing_postal_code: company?.billing_postal_code ?? "",
          billing_city: company?.billing_city ?? "",
          maalform: tone.maalform ?? "nb",
          primary_color: brand?.primary_color ?? "#1d1d1f",
          contact_name: brand?.contact_name ?? "",
          contact_email: brand?.contact_email ?? "",
          contact_phone: brand?.contact_phone ?? "",
          website: brand?.website ?? "",
        }}
        isAdmin={me?.role === "admin"}
        harLogo={Boolean(brand?.logo_path)}
      />
    </>
  );
}
