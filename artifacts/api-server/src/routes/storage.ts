import { Readable } from "node:stream";
import { Router } from "express";
import { RequestKycUploadUrlBody, RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import { getUserIdFromReq, requireAdmin, requireAuth } from "./auth.js";

const router = Router();
const objectStorage = new ObjectStorageService();
export const KYC_ALLOWED_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const KYC_MAX_FILE_SIZE = 10 * 1024 * 1024;

router.post("/storage/kyc/uploads/request-url", requireAuth, async (req, res) => {
  const parsed = RequestKycUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Допустимы PDF, JPEG, PNG или WEBP размером до 10 МБ" });
    return;
  }
  try {
    const uploadURL = await objectStorage.getKycUploadURL(getUserIdFromReq(req));
    res.json({
      uploadURL,
      objectPath: objectStorage.normalizeObjectEntityPath(uploadURL),
      metadata: parsed.data,
    });
  } catch (error) {
    (req as any).log?.error?.({ err: error }, "Error generating KYC upload URL");
    res.status(503).json({ error: "Хранилище документов временно недоступно. Повторите попытку." });
  }
});

router.post("/storage/uploads/request-url", requireAdmin, async (req, res) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.contentType.startsWith("image/")) {
    res.status(400).json({ error: "Only image uploads are supported" });
    return;
  }
  if (parsed.data.size > 5 * 1024 * 1024) {
    res.status(413).json({ error: "Logo must be 5 MB or smaller" });
    return;
  }

  try {
    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
    res.json(RequestUploadUrlResponse.parse({
      uploadURL,
      objectPath,
      metadata: parsed.data,
    }));
  } catch (error) {
    (req as any).log?.error?.({ err: error }, "Error generating partner logo upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/objects/*path", async (req, res) => {
  try {
    const rawPath = req.params.path;
    const entityId = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    if (entityId.startsWith("kyc/")) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const objectPath = `/objects/${Array.isArray(rawPath) ? rawPath.join("/") : rawPath}`;
    const response = await objectStorage.downloadObject(
      await objectStorage.getObjectEntityFile(objectPath),
    );
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    (req as any).log?.error?.({ err: error }, "Error serving stored object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;