const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function graphFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${init.method ?? "GET"} ${path} feilet (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface GraphMessage {
  id: string;
  conversationId: string | null;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType: "text" | "html"; content: string };
}

export interface GraphUser {
  id: string;
  mail: string | null;
  userPrincipalName: string;
  displayName: string | null;
}

export async function getMe(accessToken: string): Promise<GraphUser> {
  return graphFetch<GraphUser>(
    accessToken,
    "/me?$select=id,mail,userPrincipalName,displayName",
  );
}

export interface FetchMessagesOptions {
  /** Bare meldinger som kom inn etter dette tidspunktet. */
  since?: string | null;
  limit?: number;
}

/** Henter innkommende meldinger fra Innboks. */
export async function fetchInboxMessages(
  accessToken: string,
  options: FetchMessagesOptions = {},
): Promise<GraphMessage[]> {
  const limit = options.limit ?? 25;
  const params = new URLSearchParams({
    $top: String(limit),
    $orderby: "receivedDateTime desc",
    $select: "id,conversationId,subject,bodyPreview,receivedDateTime,from,body",
  });
  if (options.since) {
    params.set("$filter", `receivedDateTime ge ${options.since}`);
  }

  const data = await graphFetch<{ value: GraphMessage[] }>(
    accessToken,
    `/me/mailFolders/inbox/messages?${params.toString()}`,
  );
  return data.value ?? [];
}

/** Stripper HTML til lesbar tekst. Claude får teksten, ikke markupen. */
export function messageToPlainText(message: GraphMessage): string {
  const body = message.body;
  if (!body) return message.bodyPreview ?? "";
  if (body.contentType === "text") return body.content;

  return body.content
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
