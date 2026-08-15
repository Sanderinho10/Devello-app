import { CompanyForm } from "./CompanyForm";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DetaljerPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: me }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, org_nr, billing_address_line, billing_postal_code, billing_city")
      .eq("id", session!.companyId)
      .single(),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Selskapsdetaljer</h1>
          <p className="page-subtitle">
            Firmaopplysninger og adressen fakturaen fra oss går til.
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
        }}
        isAdmin={me?.role === "admin"}
      />
    </>
  );
}
