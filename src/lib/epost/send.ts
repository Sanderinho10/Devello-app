/**
 * Utgående e-post fra oss selv, over Resend sitt HTTP-API.
 *
 * Ikke SMTP i Supabase. Forskjellen er ikke kosmetisk: når Supabase sender,
 * svarer API-et 200 med én gang og vi får aldri vite om meldingen kom fram.
 * Herfra får vi en id på det som ble sendt, en feilmelding når det ikke gikk,
 * og en oversikt i Resend over hva som faktisk ble levert.
 *
 * Krever RESEND_API_KEY og EPOST_AVSENDER. Mangler de, kaster vi med en gang
 * og sier hva som mangler — å late som noe ble sendt er nøyaktig det som gjorde
 * innloggingslenka umulig å feilsøke.
 */

export class EpostIkkeSattOpp extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpostIkkeSattOpp";
  }
}

export interface Epost {
  til: string;
  emne: string;
  html: string;
  tekst: string;
}

export async function sendEpost(epost: Epost): Promise<{ id: string }> {
  const nokkel = process.env.RESEND_API_KEY;
  const avsender = process.env.EPOST_AVSENDER;

  if (!nokkel || !avsender) {
    throw new EpostIkkeSattOpp(
      "E-postutsending er ikke satt opp. Sett RESEND_API_KEY og EPOST_AVSENDER " +
        "på serveren — se docs/smtp-oppsett.md.",
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${nokkel}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: avsender,
      to: [epost.til],
      subject: epost.emne,
      html: epost.html,
      text: epost.tekst,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!res.ok) {
    // Resend sier ganske presist hva som er galt — ugyldig nøkkel, uverifisert
    // domene, avsender som ikke hører til domenet. Den teksten er mer verdt
    // enn noe vi kunne funnet på selv.
    throw new Error(
      `E-posten gikk ikke ut (${res.status}): ${payload.message ?? payload.name ?? "ukjent feil fra Resend"}`,
    );
  }

  return { id: payload.id ?? "" };
}

/**
 * Rammen rundt en e-post fra oss.
 *
 * Bevisst enkel HTML: tabeller og eksterne stilark er det e-postklientene
 * krangler om, og en innloggingslenke har ingenting å tjene på å se ut som
 * en reklame. Ren tekst følger alltid med — noen leser e-post uten HTML, og
 * en melding uten tekstdel scorer dårligere hos spamfiltrene.
 */
export function epostRamme(innhold: {
  overskrift: string;
  avsnitt: string[];
  knapp?: { tekst: string; url: string };
  fot?: string;
}): { html: string; tekst: string } {
  const avsnitt = innhold.avsnitt
    .map((t) => `<p style="margin:0 0 14px">${t}</p>`)
    .join("");

  const knapp = innhold.knapp
    ? `<p style="margin:22px 0">
         <a href="${innhold.knapp.url}"
            style="display:inline-block;background:#0071e3;color:#fff;text-decoration:none;
                   padding:12px 22px;border-radius:10px;font-weight:600">${innhold.knapp.tekst}</a>
       </p>
       <p style="margin:0 0 14px;color:#6e6e73;font-size:13px">
         Virker ikke knappen, kopier denne adressen inn i nettleseren:<br>
         <span style="word-break:break-all">${innhold.knapp.url}</span>
       </p>`
    : "";

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                             font-size:15px;line-height:1.55;color:#1d1d1f;max-width:520px">
      <p style="margin:0 0 18px;font-weight:600;font-size:17px">Devello</p>
      <h1 style="margin:0 0 14px;font-size:20px;font-weight:600">${innhold.overskrift}</h1>
      ${avsnitt}${knapp}
      ${innhold.fot ? `<p style="margin:24px 0 0;color:#6e6e73;font-size:13px">${innhold.fot}</p>` : ""}
    </div>`;

  const tekst = [
    "Devello",
    "",
    innhold.overskrift,
    "",
    ...innhold.avsnitt.map(stripHtml),
    ...(innhold.knapp ? ["", innhold.knapp.tekst + ":", innhold.knapp.url] : []),
    ...(innhold.fot ? ["", stripHtml(innhold.fot)] : []),
  ].join("\n");

  return { html, tekst };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}
