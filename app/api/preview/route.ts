import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

function findProductImage(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findProductImage(item);

      if (result) {
        return result;
      }
    }

    return "";
  }

  const obj = data as Record<string, unknown>;
  const type = obj["@type"];

  const isProduct =
    type === "Product" ||
    (Array.isArray(type) && type.includes("Product"));

  if (isProduct) {
    const image = obj.image;

    if (typeof image === "string") {
      return image;
    }

    if (Array.isArray(image)) {
      const first = image.find(
        (value): value is string => typeof value === "string"
      );

      if (first) {
        return first;
      }
    }

    if (image && typeof image === "object") {
      const imageObject = image as Record<string, unknown>;

      if (typeof imageObject.url === "string") {
        return imageObject.url;
      }
    }
  }

  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const result = findProductImage(item);

      if (result) {
        return result;
      }
    }
  }

  return "";
}

export async function POST(request: NextRequest) {
  try {
    const body: { url?: string } = await request.json();

    if (!body.url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    let url = body.url.trim();

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Website returned ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("title").first().text().trim() ||
      "Wishlist Item";

    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";

    const siteName =
      $('meta[property="og:site_name"]').attr("content") ||
      new URL(url).hostname.replace("www.", "");

    let image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      "";

    if (!image) {
      image =
        $('meta[name="twitter:image"]').attr("content") ||
        $('meta[name="twitter:image:src"]').attr("content") ||
        "";
    }

    if (!image) {
      $('script[type="application/ld+json"]').each((_, element) => {
        if (image) return;

        try {
          const json = JSON.parse($(element).html() || "");
          image = findProductImage(json);
        } catch {
          // Ignore invalid JSON-LD
        }
      });
    }

    if (image) {
      try {
        image = new URL(image, url).href;
      } catch {
        image = "";
      }
    }

    return NextResponse.json({
      url,
      title,
      description,
      image,
      siteName,
    });
  } catch (error) {
    console.error("Preview error:", error);

    return NextResponse.json(
      {
        error: "Could not fetch product information",
      },
      { status: 500 }
    );
  }
}