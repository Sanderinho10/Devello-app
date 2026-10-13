import { BoligmappaKort } from "./BoligmappaKort";
import { CompanyForm } from "./CompanyForm";
import { PaaslagForm } from "./PaaslagForm";
import { Postkasse, type PostkasseRad } from "./Postkasse";
import { RegnskapKort } from "./RegnskapKort";
import { SettingsForm } from "./SettingsForm";
import { standardMotor } from "@/lib/claude/motor-versjon";
import { harModul } from "@/lib/moduler";
import { pogoApplicationKey } from "@/lib/regnskap/poweroffice";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { AccountingConnectionPublic, BoligmappaConnectionPublic, ToneSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Alle innstillingane på éi side, sortert etter kven som eig dei:
 * Selskap (gjeld heile kontoen), Tilbud (tilbudsagenten) og Ordre
 * (ordremodulen, berre når selskapet har han).
 *
 * Skjemaa er framleis kvar sine: /api/company for namn og adresse,
 * /api/settings for tone og motor, /api/order-settings for påslag. To
 * skjema skal aldri eige same felt — då sprikjer dei før eller seinare.
 * Det sida samlar, er staden, ikkje lagringa.
 */
export default async function GenereltPage({
  searchParams,
}: {
  searchParams: Promise<{ koblet?: string; feil?: string; bm_koblet?: string; bm_feil?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: brand }, { data: me }, { data: mailbox }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "name, org_nr, billing_address_line, billing_postal_code, billing_city, tone_settings, motor_versjon, materials_markup_pct, moduler",
      )
      .eq("id", session!.companyId)
      .single(),
    supabase.from("company_brand").select("*").eq("company_id", session!.companyId).maybeSingle(),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
    supabase
      .from("mailbox_connections")
      .select("email_address, status, status_reason, last_synced_at, initial_fetch_from")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
  ]);

  const erAdmin = me?.role === "admin";
  const tone = (company?.tone_settings ?? {}) as ToneSettings;
  const harOrdre = harModul(company?.moduler, "ordre");

  // Ordreoppsettet hentast berre når modulen er på. Tokens til Boligmappa
  // har ingen policy; status og namn blir lesne via service role. Og utan
  // client_key frå accounting_connections: kolonnerettane i 0035 nektar
  // han, og vi ber ikkje om han heller.
  const [{ data: kopling }, { data: boligmappa }] = harOrdre
    ? await Promise.all([
        supabase
          .from("accounting_connections")
          .select(
            "id, company_id, provider, environment, status, status_reason, sync_cursor, last_sync_at, last_sync_note, product_map, settings, created_at, updated_at",
          )
          .eq("company_id", session!.companyId)
          .maybeSingle(),
        supabaseAdmin()
          .from("boligmappa_connections")
          .select("environment, status, status_reason, bm_user_name, bm_company_name, created_at")
          .eq("company_id", session!.companyId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Innstillinger</h1>
          <p className="page-subtitle">
            Firmaopplysninger og profil, det tilbudsagenten trenger, og det som
            gjelder alle ordrer.
          </p>
        </div>
      </div>

      {sp.koblet && <div className="banner success">Koblet til {sp.koblet}.</div>}
      {sp.feil && <div className="banner error">{sp.feil}</div>}

      <nav className="innstillinger-hopp" aria-label="Seksjoner">
        <a href="#selskap">Selskap</a>
        <a href="#tilbud">Tilbud</a>
        {harOrdre && <a href="#ordre">Ordre</a>}
      </nav>

      <section id="selskap" className="innstillinger-seksjon">
        <h2>Selskap</h2>
        <p className="muted">
          Firmaopplysninger, adresse og profilen agentene bruker på tilbudene.
          Gjelder hele selskapet.
        </p>
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
          isAdmin={erAdmin}
          harLogo={Boolean(brand?.logo_path)}
        />
      </section>

      <section id="tilbud" className="innstillinger-seksjon">
        <h2>Tilbud</h2>
        <p className="muted">Postkassen tilbudene svarer fra, og teksten agenten skriver.</p>
        <div className="stack">
          <Postkasse mailbox={(mailbox as PostkasseRad | null) ?? null} />
          <SettingsForm
            company={{
              tone_settings: tone,
              motor_versjon: company?.motor_versjon ?? null,
            }}
            brand={brand ?? null}
            standardMotor={standardMotor()}
          />
        </div>
      </section>

      {harOrdre && (
        <section id="ordre" className="innstillinger-seksjon">
          <h2>Ordre</h2>
          <p className="muted">Det som gjelder alle ordrer. Prisfilen har egen fane.</p>
          <div className="stack">
            <PaaslagForm paaslag={Number(company?.materials_markup_pct ?? 25)} erAdmin={erAdmin} />
            <RegnskapKort
              kopling={(kopling as AccountingConnectionPublic | null) ?? null}
              erAdmin={erAdmin}
              applicationKeys={{
                production: pogoApplicationKey("production"),
                demo: pogoApplicationKey("demo"),
              }}
            />
            <BoligmappaKort
              kopling={(boligmappa as BoligmappaConnectionPublic | null) ?? null}
              erAdmin={erAdmin}
              konfigurert={Boolean(process.env.BOLIGMAPPA_CLIENT_ID && process.env.BOLIGMAPPA_CLIENT_SECRET)}
              melding={{ feil: sp.bm_feil, koblet: sp.bm_koblet }}
            />
          </div>
        </section>
      )}
    </>
  );
}
