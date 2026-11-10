import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { epostRamme, EpostIkkeSattOpp, sendEpost } from "@/lib/epost/send";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Tilbakemelding fra kundene, rett i innboksen til Devello.
 *
 * Lagres først i devello_tilbakemeldinger (oversikten på
 * /devello/tilbakemeldinger), så sendes e-posten. Svar-til er kunden selv, så
 * «Svar» i e-postprogrammet går rett til dem. Feiler e-posten, er meldingen
 * likevel tatt vare på — kunden får beskjed om at den kom fram.
 *
 * Åpen også uten aktivt abonnement — det er nettopp da noen kan ha noe å si.
 */

const TYPER: Record<string, string> = {
  feil: "Feil",
  onske: "Ønske",
  annet: "Tilbakemelding",
};

const MAKS_LENGDE = 5000;

function mottakere(): string[] {
  const fra = (v: string | undefined) =>
    (v ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  const egne = fra(process.env.TILBAKEMELDING_EPOST);
  return egne.length > 0 ? egne : fra(process.env.DEVELLO_ADMIN_EPOST).slice(0, 1);
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  const session = await sessionOr401({ utenAbonnement: true });
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      type?: string;
      melding?: string;
      side?: string;
    };
    const melding = (body.melding ?? "").trim();
    if (!melding) {
      return NextResponse.json({ error: "Skriv noen ord først." }, { status: 400 });
    }
    if (melding.length > MAKS_LENGDE) {
      return NextResponse.json(
        { error: `Meldingen er for lang (maks ${MAKS_LENGDE} tegn).` },
        { status: 400 },
      );
    }
    const typeKode = body.type && Object.hasOwn(TYPER, body.type) ? body.type : "annet";
    const type = TYPER[typeKode];
    const side = (body.side ?? "").slice(0, 300);
    const nettleser = (request.headers.get("user-agent") ?? "").slice(0, 500);

    const admin = supabaseAdmin();
    const { data: company } = await admin
      .from("companies")
      .select("name")
      .eq("id", session.companyId)
      .maybeSingle();
    const selskap = company?.name ?? "Ukjent selskap";

    const { data: rad, error: lagreFeil } = await admin
      .from("devello_tilbakemeldinger")
      .insert({
        company_id: session.companyId,
        user_id: session.userId,
        epost: session.email,
        selskap,
        type: typeKode,
        melding,
        side: side || null,
        nettleser: nettleser || null,
      })
      .select("id")
      .single();
    if (lagreFeil) console.error("Tilbakemelding ble ikke lagret:", lagreFeil.message);

    let epostFeil: unknown = null;
    try {
      const til = mottakere();
      if (til.length === 0) {
        throw new EpostIkkeSattOpp(
          "Tilbakemeldinger er ikke satt opp. Sett TILBAKEMELDING_EPOST på serveren.",
        );
      }

      const { html, tekst } = epostRamme({
        overskrift: `${type} fra ${escape(selskap)}`,
        avsnitt: [
          escape(melding).replace(/\n/g, "<br>"),
          `<span style="color:#6e6e73;font-size:13px">` +
            `Fra: ${escape(session.email)}<br>` +
            `Selskap: ${escape(selskap)}<br>` +
            (side ? `Side: ${escape(side)}<br>` : "") +
            `Nettleser: ${escape(nettleser || "ukjent")}` +
            `</span>`,
        ],
        fot: "Svar på denne e-posten, så går svaret rett til kunden.",
      });

      await Promise.all(
        til.map((adresse) =>
          sendEpost({
            til: adresse,
            emne: `[${type}] ${selskap}: ${melding.split("\n")[0].slice(0, 60)}`,
            html,
            tekst,
            svarTil: session.email,
          }),
        ),
      );
      if (rad) {
        await admin.from("devello_tilbakemeldinger").update({ epost_sendt: true }).eq("id", rad.id);
      }
    } catch (err) {
      epostFeil = err;
      console.error("Tilbakemelding: e-posten gikk ikke ut:", err);
    }

    // Kom den fram ett av stedene, har vi den.
    if (lagreFeil && epostFeil) throw epostFeil;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
