import { File, UploadType } from "expo-file-system";
import { API_URL, fornySesjon, hentToken, kall } from "../api";
import type { BiletePayload, MateriellPayload, NotatPayload, StatusPayload, Svar, TimePayload, UtboksRad } from "./typer";

/**
 * Selve kallet for én utboksrad. Kaster NettFeil når serveren ikke nås;
 * alt annet kommer tilbake som status, så planleggeren kan bestemme.
 */

function tilSvar(status: number, json: unknown): Svar {
  const o = (json && typeof json === "object" ? json : {}) as { error?: unknown; id?: unknown };
  return {
    slag: "http",
    status,
    melding: typeof o.error === "string" ? o.error : null,
    server_id: typeof o.id === "string" ? o.id : null,
    json,
  };
}

export async function send(rad: UtboksRad): Promise<Svar> {
  switch (rad.type) {
    case "time": {
      const p = JSON.parse(rad.payload) as TimePayload;
      const s = await kall(`/api/orders/${rad.ordre_id}/timer`, {
        method: "POST",
        body: { work_date: p.work_date, price_item_id: p.price_item_id, hours: p.hours, note: p.note, client_id: rad.client_id },
      });
      return tilSvar(s.status, s.json);
    }
    case "materiell": {
      const p = JSON.parse(rad.payload) as MateriellPayload;
      const body = p.supplier_item_id
        ? { supplier_item_id: p.supplier_item_id, quantity: p.quantity, note: p.note, client_id: rad.client_id }
        : {
            name: p.name,
            unit: p.unit,
            quantity: p.quantity,
            cost_price: p.cost_price,
            sale_price: p.sale_price,
            note: p.note,
            client_id: rad.client_id,
          };
      const s = await kall(`/api/orders/${rad.ordre_id}/materiell`, { method: "POST", body });
      return tilSvar(s.status, s.json);
    }
    case "notat": {
      const p = JSON.parse(rad.payload) as NotatPayload;
      const s = await kall(`/api/orders/${rad.ordre_id}/notat`, {
        method: "POST",
        body: { text: p.text, client_id: rad.client_id },
      });
      return tilSvar(s.status, s.json);
    }
    case "status": {
      const p = JSON.parse(rad.payload) as StatusPayload;
      const s = await kall(`/api/orders/${rad.ordre_id}`, { method: "PATCH", body: { status: p.status } });
      return tilSvar(s.status, s.json);
    }
    case "bilete":
      return sendBilete(rad);
  }
}

/**
 * Bildet lastes opp som multipart rett fra fila på disk — aldri via minnet.
 * 400 med melding = lokal feil som ikke skal prøves igjen (fila er borte).
 */
async function sendBilete(rad: UtboksRad, proevdRefresh = false): Promise<Svar> {
  const p = JSON.parse(rad.payload) as BiletePayload;
  if (!rad.fil_sti) return { slag: "http", status: 400, melding: "Bildet mangler fil.", server_id: null };
  const fil = new File(rad.fil_sti);
  if (!fil.exists) return { slag: "http", status: 400, melding: "Bildet finnes ikke lenger på telefonen.", server_id: null };
  if (!p.note_id) return { slag: "http", status: 400, melding: "Notatet bildet hører til er ikke sendt.", server_id: null };

  const token = await hentToken();
  const parametre: Record<string, string> = { title: p.title, note_id: p.note_id, client_id: rad.client_id };
  let res: { status: number; body: string };
  try {
    res = await fil.upload(`${API_URL}/api/orders/${rad.ordre_id}/dokumenter`, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      mimeType: p.mime,
      parameters: parametre,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    return { slag: "nett" };
  }
  if (res.status === 401 && !proevdRefresh && (await fornySesjon())) return sendBilete(rad, true);
  let json: unknown = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = null;
  }
  return tilSvar(res.status, json);
}
