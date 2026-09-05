import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Storage, type File } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR is not configured");
    }
    return dir;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const { bucketName, objectName } = parseObjectPath(
      `${privateDir}/partner-logos/${randomUUID()}`,
    );
    return signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
  }

  async getKycUploadURL(userId: number): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const { bucketName, objectName } = parseObjectPath(
      `${privateDir}/kyc/${userId}/${randomUUID()}`,
    );
    return signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    const privateDir = this.getPrivateObjectDir().replace(/\/$/, "");
    if (!rawObjectPath.startsWith(`${privateDir}/`)) {
      return rawObjectPath;
    }
    return `/objects/${rawObjectPath.slice(privateDir.length + 1)}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice("/objects/".length);
    if (!entityId || entityId.includes("..") || entityId.startsWith("/")) {
      throw new ObjectNotFoundError();
    }

    const { bucketName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir().replace(/\/$/, "")}/${entityId}`,
    );
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  async getObjectEntityMetadata(objectPath: string): Promise<{ contentType: string; size: number }> {
    const [metadata] = await (await this.getObjectEntityFile(objectPath)).getMetadata();
    const size = Number(metadata.size ?? 0);
    return {
      contentType: metadata.contentType ?? "application/octet-stream",
      size: Number.isFinite(size) ? size : 0,
    };
  }

  async deleteObjectEntity(objectPath: string): Promise<void> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice("/objects/".length);
    if (!entityId || entityId.includes("..") || entityId.startsWith("/")) {
      throw new ObjectNotFoundError();
    }

    const { bucketName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir().replace(/\/$/, "")}/${entityId}`,
    );
    await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
  }

  async listPartnerLogoObjectPaths(): Promise<string[]> {
    const privateDir = this.getPrivateObjectDir().replace(/\/$/, "");
    const { bucketName, objectName: prefix } = parseObjectPath(`${privateDir}/partner-logos/`);
    const [files] = await objectStorageClient.bucket(bucketName).getFiles({ prefix });

    return files
      .map((file) => file.name.slice(prefix.length))
      // A directory marker is not a logo object. Uploaded logos always have
      // a generated object name after the partner-logos/ prefix.
      .filter(Boolean)
      .map((objectName) => `/objects/partner-logos/${objectName}`);
  }

  async downloadObject(file: File): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
        ...(metadata.size ? { "Content-Length": String(metadata.size) } : {}),
      },
    });
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "PUT" | "GET";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to sign object URL (${response.status})`);
  }
  const data = (await response.json()) as { signed_url?: string };
  if (!data.signed_url) {
    throw new Error("Object storage returned no signed URL");
  }
  return data.signed_url;
}