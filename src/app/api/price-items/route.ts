import { NextResponse, type NextRequest } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { nestePosisjon } from "@/app/api/price-lists/route";
import { normaliserKode, prefiksAv } from "@/lib/pricelist/koder";

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = await request.json();
  if (!body.price_list_id) {
    return NextResponse.json({ error: "Mangler prisliste" }, { status: 400 });
  }
  if (!body.name?.trim() || body.unit_price === undefined || body.unit_price === null) {
    return NextResponse.json(
      { error: "Navn og enhetspris er påkrevd" },
      { status: 400 },
    );
  }
  const pris = Number(body.unit_price);
  if (!Number.isFinite(pris) || pris < 0) {
    return NextResponse.json({ error: "Prisen må være et tall, 0 eller mer." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Typen på raden kommer fra listen, ikke fra klienten. Databasen krever at de er
  // like, så dette er både tilgangssjekk og datakontroll i ett.
  const { data: list } = await admin
    .from("price_lists")
    .select("id, kind")
    .eq("id", body.price_list_id)
    .eq("company_id", session.companyId)
    .maybeSingle();

  if (!list) {
    return NextResponse.json({ error: "Fant ikke prislisten" }, { status: 404 });
  }

  const code: string | null = body.code?.trim() ? normaliserKode(body.code) : null;
  const prefiks = prefiksAv(code);

  // Kodene er kategorier, og to poster med samme kode i én liste gjør det
  // umulig å vite hvilken agenten og tilbudet peker på.
  const { data: rader } = await admin
    .from("price_list_items")
    .select("code, position")
    .eq("price_list_id", list.id);
  if (code && (rader ?? []).some((rad) => rad.code?.trim().toUpperCase() === code)) {
    return NextResponse.json(
      { error: `Koden ${code} finnes allerede i prislisten.` },
      { status: 409 },
    );
  }

  // Plassen i fila. Har kategorien poster fra før, legges den nye rett under
  // den siste av dem — der man leter etter den. En ny kategori får
  // overskriftsraden sin nederst, med posten under. Uten kode havner raden
  // nederst, som før.
  const iKategori = prefiks
    ? (rader ?? []).filter((rad) => prefiksAv(rad.code) === prefiks)
    : [];
  let position: number;
  if (iKategori.length > 0) {
    position = Math.max(...iKategori.map((rad) => rad.position)) + 1;
    const { error: plassFeil } = await admin.rpc("gjer_plass_i_prisliste", {
      p_liste: list.id,
      p_posisjon: position,
    });
    if (plassFeil) return NextResponse.json({ error: plassFeil.message }, { status: 500 });
  } else {
    position = await nestePosisjon(admin, list.id);
    const kategoriNavn = typeof body.kategori_navn === "string" ? body.kategori_navn.trim() : "";
    if (prefiks && kategoriNavn) {
      // Overskriftsraden, slik resten av fila har dem: koden er bare
      // prefikset, og prisen er 0.
      const { error: overskriftFeil } = await admin.from("price_list_items").insert({
        company_id: session.companyId,
        price_list_id: list.id,
        position,
        kind: list.kind,
        code: prefiks,
        name: kategoriNavn,
        unit: "stk",
        unit_price: 0,
        includes_labour: list.kind !== "materiell",
        includes_material: list.kind !== "time",
      });
      if (overskriftFeil) {
        return NextResponse.json({ error: overskriftFeil.message }, { status: 500 });
      }
      position += 1;
    }
  }

  const { data: item, error } = await admin
    .from("price_list_items")
    .insert({
      company_id: session.companyId,
      price_list_id: list.id,
      position,
      kind: list.kind,
      code,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      unit: body.unit?.trim() || "stk",
      unit_price: pris,
      // Punktpris er buntet; de andre dekker én ting hver.
      includes_labour: list.kind !== "materiell",
      includes_material: list.kind !== "time",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Raden tilbake, så et tilbudsutkast kan peke på den med én gang.
  return NextResponse.json({ ok: true, item });
}

/**
 * Rett én rad på stedet. Bare feltene som sendes inn endres.
 *
 * Typen (kind) og lista raden hører til er ikke med: de er bestemt av lista,
 * og en rad som bytter type midt i en aktiv prisliste ville brutt
 * forutsetningen genereringen bygger på.
 */
export async function PATCH(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = (await request.json()) as {
    id?: string;
    unit_price?: unknown;
    name?: unknown;
    unit?: unknown;
    code?: unknown;
    description?: unknown;
  };
  if (!body.id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if (body.unit_price !== undefined) {
    const pris = Number(body.unit_price);
    if (!Number.isFinite(pris) || pris < 0) {
      return NextResponse.json({ error: "Prisen må være et tall, 0 eller mer." }, { status: 400 });
    }
    patch.unit_price = pris;
  }
  if (typeof body.name === "string") {
    const navn = body.name.trim();
    if (!navn) return NextResponse.json({ error: "Navn kan ikke være tomt." }, { status: 400 });
    patch.name = navn;
  }
  if (typeof body.unit === "string") patch.unit = body.unit.trim() || "stk";
  if (typeof body.code === "string") patch.code = body.code.trim() || null;
  if (typeof body.description === "string") patch.description = body.description.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Ingenting å endre" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("price_list_items")
    .update(patch)
    .eq("id", body.id)
    // Selskapet kommer fra sesjonen: id-en er ikke tilgang.
    .eq("company_id", session.companyId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Fant ikke raden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("price_list_items")
    .delete()
    .eq("id", id)
    .eq("company_id", session.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
