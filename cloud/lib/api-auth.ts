import { getChatGPTUser } from "../app/chatgpt-auth";
export async function authorized(request?: Request) {
  const user = await getChatGPTUser();
  if (!user) return null;
  if (request && request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) return null;
  }
  return user;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
