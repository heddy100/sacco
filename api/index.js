import server from "../dist/server/server.js";

function readRequestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;

  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

export default async function handler(request, response) {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }

    const url = `https://${headers.get("host") ?? "localhost"}${request.url ?? "/"}`;
    const body = await readRequestBody(request);
    const webRequest = new Request(url, {
      method: request.method,
      headers,
      body,
    });
    const webResponse = await server.fetch(webRequest, process.env, {});

    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Internal Server Error");
  }
}