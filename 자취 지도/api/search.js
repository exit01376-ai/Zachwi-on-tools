const stripMarkup = (value = "") =>
  value
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim();

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "GET 요청만 지원합니다." });
  }

  const searchClientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const searchClientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;

  if (!searchClientId || !searchClientSecret) {
    return response.status(503).json({
      error: "배포 서버에 네이버 검색 API 환경변수가 설정되지 않았습니다.",
    });
  }

  const rawQuery = Array.isArray(request.query.query)
    ? request.query.query[0]
    : request.query.query;
  const query = rawQuery?.trim();

  if (!query) {
    return response.status(400).json({ error: "검색할 가게 이름을 입력해 주세요." });
  }

  const endpoint = new URL("https://openapi.naver.com/v1/search/local.json");
  endpoint.searchParams.set("query", query.slice(0, 100));
  endpoint.searchParams.set("display", "5");
  endpoint.searchParams.set("sort", "random");

  try {
    const apiResponse = await fetch(endpoint, {
      headers: {
        "X-Naver-Client-Id": searchClientId,
        "X-Naver-Client-Secret": searchClientSecret,
      },
    });

    if (!apiResponse.ok) {
      const authError = apiResponse.status === 401 || apiResponse.status === 403;
      return response.status(authError ? 401 : 502).json({
        error: authError
          ? "네이버 개발자센터 검색 API 인증 정보를 확인해 주세요."
          : `네이버 지역 검색 API 오류가 발생했습니다. (HTTP ${apiResponse.status})`,
      });
    }

    const payload = await apiResponse.json();
    const items = (payload.items ?? [])
      .map((item) => ({
        name: stripMarkup(item.title),
        category: stripMarkup(item.category),
        address: item.roadAddress || item.address || "",
        roadAddress: item.roadAddress || "",
        jibunAddress: item.address || "",
        lng: Number(item.mapx) / 10_000_000,
        lat: Number(item.mapy) / 10_000_000,
        link: item.link || "",
      }))
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ items });
  } catch {
    return response.status(502).json({
      error: "네이버 지역 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
}
