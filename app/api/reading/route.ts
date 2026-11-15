import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type ReadingRow = {
  k: string;
  text_overview: string | null;
  text_personality: string | null;
  text_love: string | null;
  text_career: string | null;
  text_wealth: string | null;
  text_health: string | null;
  text_family: string | null;
  text_children: string | null;
  text_move: string | null;
  text_friends: string | null;
  text_home: string | null;
  text_spirit: string | null;
  text_parents: string | null;
};

type D1Binding = {
  prepare(query: string): {
    bind(...values: string[]): {
      first<Result>(): Promise<Result | null>;
    };
  };
};

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("k")?.trim();

  if (!key) {
    return Response.json(
      { error: "Missing required query parameter: k" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as typeof env & { DB: D1Binding }).DB;
    const reading = await db
      .prepare("SELECT * FROM readings WHERE k = ? LIMIT 1")
      .bind(key)
      .first<ReadingRow>();

    if (!reading) {
      return Response.json(
        { error: "Reading not found", k: key },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(reading, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to query D1 readings:", error);
    return Response.json(
      { error: "Failed to query readings database" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
