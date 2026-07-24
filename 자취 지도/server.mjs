import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const ports = [3002, 3004];
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

async function loadLocalEnv() {
  try {
    const source = await readFile(path.join(root, ".env.local"), "utf8");
    return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }));
  } catch { return {}; }
}

const stripMarkup = (value = "") => value.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&").trim();

async function searchPlaces(url, response) {
  const localEnv = await loadLocalEnv();
  const searchClientId = process.env.NAVER_SEARCH_CLIENT_ID || localEnv.NAVER_SEARCH_CLIENT_ID;
  const searchClientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET || localEnv.NAVER_SEARCH_CLIENT_SECRET;
  if (!searchClientId || !searchClientSecret) {
    response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: ".env.local에 네이버 개발자센터 검색 API Client ID와 Client Secret을 입력해 주세요." }));
    return;
  }
  const query = url.searchParams.get("query")?.trim();
  if (!query) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Search query is required." }));
    return;
  }
  const endpoint = new URL("https://openapi.naver.com/v1/search/local.json");
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("display", "5");
  endpoint.searchParams.set("sort", "random");
  try {
    const apiResponse = await fetch(endpoint, { headers: { "X-Naver-Client-Id": searchClientId, "X-Naver-Client-Secret": searchClientSecret } });
    if (!apiResponse.ok) {
      const message = apiResponse.status === 401 || apiResponse.status === 403
        ? "현재 키는 지역 검색 API에서 인증되지 않습니다. NAVER Cloud 지도 키가 아니라 네이버 개발자센터의 검색 API용 Client ID와 Client Secret을 입력해 주세요."
        : `NAVER 지역 검색 API 오류가 발생했습니다. (HTTP ${apiResponse.status})`;
      response.writeHead(apiResponse.status === 401 || apiResponse.status === 403 ? 401 : 502, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: message }));
      return;
    }
    const payload = await apiResponse.json();
    const items = (payload.items ?? []).map((item) => ({
      name: stripMarkup(item.title), category: stripMarkup(item.category), address: item.roadAddress || item.address || "", roadAddress: item.roadAddress || "", jibunAddress: item.address || "", lng: Number(item.mapx) / 10_000_000, lat: Number(item.mapy) / 10_000_000, link: item.link || "",
    })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ items }));
  } catch (error) {
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "NAVER local search failed.", detail: String(error) }));
  }
}

const handleRequest = async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname === "/api/search") { await searchPlaces(url, response); return; }
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(root) || !(await stat(target)).isFile()) throw new Error("not found");
    response.writeHead(200, { "Content-Type": types[path.extname(target)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
};

for (const port of ports) {
  http.createServer(handleRequest).listen(port, "127.0.0.1", () => {
    console.log(`JachwiON map: http://localhost:${port}/index.html`);
  });
}
