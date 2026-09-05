import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";
import express from "express";
import { createToken } from "./auth.js";
import storageRouter from "./storage.js";

let server: Server;
let baseUrl: string;

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(storageRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("public object serving never exposes KYC objects", async () => {
  const response = await request("/storage/objects/kyc/1/not-a-real-document.pdf");
  assert.equal(response.status, 404);
});

test("KYC upload URL requires an authenticated user", async () => {
  const response = await request("/storage/kyc/uploads/request-url", {
    method: "POST",
    body: JSON.stringify({ name: "passport.png", size: 100, contentType: "image/png" }),
  });
  assert.equal(response.status, 401);
});

test("KYC upload rejects unsupported files before touching storage", async () => {
  const response = await request("/storage/kyc/uploads/request-url", {
    method: "POST",
    headers: { authorization: `Bearer ${createToken({ userId: 1 })}` },
    body: JSON.stringify({ name: "script.exe", size: 100, contentType: "application/x-msdownload" }),
  });
  assert.equal(response.status, 400);
});

test("KYC upload reports storage failures instead of claiming success", async () => {
  const response = await request("/storage/kyc/uploads/request-url", {
    method: "POST",
    headers: { authorization: `Bearer ${createToken({ userId: 1 })}` },
    body: JSON.stringify({ name: "passport.png", size: 100, contentType: "image/png" }),
  });
  assert.equal(response.status, 503);
  assert.match(String((await response.json() as { error: string }).error), /хранилище/i);
});