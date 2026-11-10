import { SettingsForm } from "../_deler/SettingsForm";
import { standardMotor } from "@/lib/claude/motor-versjon";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { ToneSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TilbudsagentPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();
  const [{ data: company }, { data: brand }] = await Promise.all([
    supabase.from("companies").select("tone_settings, motor_versjon").eq("id", session!.companyId).single(),
    supabase.from("company_brand").select("*").eq("company_id", session!.companyId).maybeSingle(),
  ]);

  return (
    <SettingsForm
      company={{ tone_settings: (company?.tone_settings ?? {}) as ToneSettings, motor_versjon: company?.motor_versjon ?? null }}
      brand={brand ?? null}
      standardMotor={standardMotor()}
    />
  );
}
