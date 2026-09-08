import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

type ProductData = {
  name: string;
  description: string;
  image: string;
};

function toAbsoluteUrl(value: string, pageUrl: string): string {
  try {
    return new URL(value, pageUrl).href;
  } catch {
    return "";
  }
}

function extractImage(value: unknown, pageUrl: string): string {
  if (typeof value === "string") {
    return toAbsoluteUrl(value, pageUrl);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractImage(item, pageUrl);

      if (result) {
        return result;
      }
    }

    return "";
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (typeof obj.url === "string") {
      return toAbsoluteUrl(obj.url, pageUrl);
    }

    if (typeof obj.contentUrl === "string") {
      return toAbsoluteUrl(obj.contentUrl, pageUrl);
    }
  }

  return "";
}

function findProduct(data: unknown): ProductData | null {
  if (!data) {
    return null;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findProduct(item);

      if (result) {
        return result;
      }
    }

    return null;
  }

  if (typeof data !== "object") {
    return null;
  }

  const obj = data as Record<string, unknown>;
  const type = obj["@type"];

  const isProduct =
    type === "Product" ||
    (Array.isArray(type) && type.includes("Product"));

  if (isProduct) {
    return {
      name:
        typeof obj.name === "string"
          ? obj.name
          : "",

      description:
        typeof obj.description === "string"
          ? obj.description
          : "",

      image:
        extractImage(obj.image, "") || "",
    };
  }

  if (obj["@graph"]) {
    const result = findProduct(obj["@graph"]);

    if (result) {
      return result;
    }
  }

  return null;
}

function findJsonLdProduct(
  $: cheerio.CheerioAPI,
  pageUrl: string
): ProductData | null {
  const scripts = $('script[type="application/ld+json"]');

  for (let i = 0; i < scripts.length; i++) {
    const element = scripts.eq(i);

    try {
      const json = JSON.parse(element.html() || "");

      const product = findProduct(json);

      if (product) {
        return {
          name: product.name,
          description: product.description,
          image: extractImage(
            product.image,
            pageUrl
          ),
        };
      }
    } catch {
      // Ignore invalid JSON-LD
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body: { url?: string } =
      await request.json();

    if (!body.url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    let url = body.url.trim();

    if (
      !url.startsWith("http://") &&
      !url.startsWith("https://")
    ) {
      url = "https://" + url;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",

        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

        "Accept-Language":
          "en-US,en;q=0.9",
      },

      redirect: "follow",
      cache: "no-store",
    });

    /*
     * If a website blocks our request,
     * return a controlled response.
     */
    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Website returned ${response.status}`,
        },
        { status: response.status }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    /*
     * -----------------------------
     * Open Graph
     * -----------------------------
     */

    let title =
      $('meta[property="og:title"]')
        .attr("content")
        ?.trim() || "";

    let description =
      $('meta[property="og:description"]')
        .attr("content")
        ?.trim() || "";

    let image =
      $('meta[property="og:image"]')
        .attr("content")
        ?.trim() || "";

    if (!image) {
      image =
        $('meta[property="og:image:url"]')
          .attr("content")
          ?.trim() || "";
    }

    /*
     * -----------------------------
     * Twitter
     * -----------------------------
     */

    if (!title) {
      title =
        $('meta[name="twitter:title"]')
          .attr("content")
          ?.trim() || "";
    }

    if (!description) {
      description =
        $('meta[name="twitter:description"]')
          .attr("content")
          ?.trim() || "";
    }

    if (!image) {
      image =
        $('meta[name="twitter:image"]')
          .attr("content")
          ?.trim() || "";
    }

    if (!image) {
      image =
        $('meta[name="twitter:image:src"]')
          .attr("content")
          ?.trim() || "";
    }

    /*
     * -----------------------------
     * JSON-LD Product
     * -----------------------------
     */

    const product = findJsonLdProduct($, url);

    if (product) {
      if (!title && product.name) {
        title = product.name;
      }

      if (
        !description &&
        product.description
      ) {
        description = product.description;
      }

      if (!image && product.image) {
        image = product.image;
      }
    }

    /*
     * -----------------------------
     * Standard HTML metadata
     * -----------------------------
     */

    if (!title) {
      title =
        $("title")
          .first()
          .text()
          .trim() || "";
    }

    if (!description) {
      description =
        $('meta[name="description"]')
          .attr("content")
          ?.trim() || "";
    }

    /*
     * -----------------------------
     * Microdata
     * -----------------------------
     */

    if (!title) {
      const nameElement =
        $('[itemprop="name"]').first();

      title =
        nameElement.attr("content") ||
        nameElement.text().trim() ||
        "";
    }

    if (!description) {
      const descriptionElement =
        $('[itemprop="description"]').first();

      description =
        descriptionElement.attr("content") ||
        descriptionElement.text().trim() ||
        "";
    }

    if (!image) {
      const imageElement =
        $('[itemprop="image"]').first();

      image =
        imageElement.attr("content") ||
        imageElement.attr("src") ||
        "";
    }

    /*
     * -----------------------------
     * Convert image URL
     * -----------------------------
     */

    if (image) {
      image = toAbsoluteUrl(image, url);
    }

    /*
     * -----------------------------
     * Site name
     * -----------------------------
     */

    const siteName =
      $('meta[property="og:site_name"]')
        .attr("content")
        ?.trim() ||
      new URL(url).hostname.replace(
        "www.",
        ""
      );

    return NextResponse.json({
      url,
      title: title || "Wishlist Item",
      description,
      image,
      siteName,
    });
  } catch (error) {
    console.error(
      "Preview error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Could not fetch product information",
      },
      { status: 500 }
    );
  }
}
