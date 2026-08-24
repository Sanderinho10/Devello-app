import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { EpostIkkeSattOpp, epostRamme, sendEpost } from "@/lib/epost/send";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * «Send meg en lenke i stedet».
 *
 * Vi sender denne selv i stedet for å be Supabase gjøre det. Grunnen står i
 * migrasjon 0026: Supabase svarer 200 uansett, så da lenkene sluttet å komme
 * fram hadde vi ingen måte å se det på — verken i loggen eller i UI-et.
 *
 * Lenken peker på vår egen side, ikke på Supabase. Safe Links i Microsoft 365
 * henter lenker i innkommende e-post automatisk, og en engangslenke fra
 * Supabase er da brukt opp før mottakeren rekker å klikke. Vår side gjør
 * ingenting på GET.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Finnes kontoen? Vi sier fra når den ikke gjør det.
    //
    // Det avslører at en adresse er registrert hos oss, og det er en avveining
    // gjort med åpne øyne: Devello er et lukket verktøy man blir invitert inn
    // i, ikke en tjeneste man melder seg på. Den som skriver adressen sin her
    // er så godt som alltid en kunde som ikke kommer inn, og for dem er «vi
    // fant ingen konto» svaret som løser problemet. «Sjekk e-posten» når det
    // ikke finnes noen konto er nøyaktig blindveien vi prøver å bli kvitt.
    const { data: bruker } = await admin
      .from("users")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (!bruker) {
      return NextResponse.json(
        {
          error:
            "Vi fant ingen konto på denne adressen. Sjekk skrivemåten, eller be " +
            "en administrator i selskapet om en invitasjon.",
        },
        { status: 404 },
      );
    }

    // Åpne lenker til samme bruker blir ugyldige. Ber noen om en ny lenke fordi
    // den forrige ikke kom fram, skal ikke begge virke.
    await admin
      .from("login_tokens")
      .delete()
      .eq("user_id", bruker.id)
      .is("used_at", null);

    const { data: rad, error } = await admin
      .from("login_tokens")
      .insert({ user_id: bruker.id })
      .select("token")
      .single();
    if (error) throw new Error(error.message);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const url = `${appUrl}/logg-inn/${rad.token}`;

    const { html, tekst } = epostRamme({
      overskrift: "Logg inn i Devello",
      avsnitt: [
        "Du ba om en innloggingslenke. Trykk på knappen, så er du inne.",
      ],
      knapp: { tekst: "Logg inn", url },
      fot:
        "Lenken varer i 30 minutter og kan brukes én gang. Var det ikke du som " +
        "ba om den, kan du se bort fra denne e-posten — ingen kommer inn på " +
        "kontoen din uten lenken.",
    });

    const { id } = await sendEpost({
      til: bruker.email ?? email,
      emne: "Innloggingslenke til Devello",
      html,
      tekst,
    });

    // Id-en fra Resend gjør at vi kan slå opp akkurat denne meldingen når noen
    // sier at den ikke kom fram.
    console.info(`innloggingslenke sendt til ${maskert(email)} (resend id ${id})`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EpostIkkeSattOpp) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return errorResponse(err);
  }
}

/** «sa****@hotmail.com». Nok til å kjenne igjen adressen, ikke nok til å lekke den. */
function maskert(email: string): string {
  const [navn, domene] = email.split("@");
  return `${navn.slice(0, 2)}***@${domene ?? ""}`;
}
