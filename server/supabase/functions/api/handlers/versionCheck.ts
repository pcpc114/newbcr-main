import { getDb } from "../db.ts";
import { json } from "../responses.ts";

interface VersionRequest {
  clientVersion?: string;
  platform?: string;
}

function parseSemver(v: string): number[] {
  return v.split(".").map((p) => parseInt(p, 10) || 0);
}

function semverGte(a: string, b: string): boolean {
  const [aMaj, aMin, aPat] = parseSemver(a);
  const [bMaj, bMin, bPat] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat >= bPat;
}

export async function handleVersionCheck(req: Request): Promise<Response> {
  let body: VersionRequest = {};
  try {
    body = await req.json();
  } catch { /* tolerate */ }
  const platform = body.platform ?? "desktop";
  const clientVersion = body.clientVersion ?? "0.0.0";

  const db = getDb();
  const { data: row } = await db
    .from("app_versions")
    .select("required_version, download_url, file_name, message")
    .eq("platform", platform)
    .maybeSingle();

  if (!row) {
    // Default: assume compatible if no policy exists
    return json({
      requiredVersion: "0.0.0",
      compatible: true,
      message: null,
      downloadUrl: null,
      fileName: null,
    });
  }

  const compatible = semverGte(clientVersion, row.required_version);
  return json({
    requiredVersion: row.required_version,
    compatible,
    message: row.message,
    downloadUrl: row.download_url,
    fileName: row.file_name,
  });
}
