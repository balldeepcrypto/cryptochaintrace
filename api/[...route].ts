// @ts-nocheck
// Imports the pre-built Express bundle produced by `pnpm --filter @workspace/api-server run build`.
// Using the compiled JS output avoids Vercel's TypeScript compiler having to resolve
// pnpm workspace packages (@workspace/api-zod, @workspace/db) and their .ts exports.
import app from "../artifacts/api-server/dist/handler.mjs";

export default function handler(req, res) {
  app(req, res);
}
