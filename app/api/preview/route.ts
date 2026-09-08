import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

type Metadata = {
  title: string;
  description: string;
  image: string;
  siteName: string;
};

function absoluteUrl(value: string, pageUrl: string): string {
  try {
    return new URL(value, pageUrl).href;
  } catch {
    return "";
  }
}

function getImage(value: unknown, pageUrl: string): string {
  if (typeof value === "string") {
    return absoluteUrl(value, pageUrl);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = getImage(item, pageUrl);

      if (image) {
        return image;
      }
    }
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    return (
      getImage(obj.url, pageUrl) ||
      getImage(obj.contentUrl, pageUrl) ||
      getImage(obj["@id"], pageUrl)
    );
  }

  return "";
}

function findProduct(data: unknown): Record<string, unknown> | null {
  if (!data) {
    return null;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const product = findProduct(item);

      if (product) {
        return product;
      }
    }

    return null;
  }

  if (typeof data !== "object") {
    return null;
  }

  const obj = data as Record<string, unknown>;

  const type = obj["@type"];

  if (
    type === "Product" ||
    (Array.isArray(type) && type.includes("Product"))
  ) {
    return obj;
  }

  if (obj["@graph"]) {
    const product = findProduct(obj["@graph"]);

    if (product) {
      return product;
    }
  }

  return null;
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

    if (
      !url.startsWith("http://") &&
      !url.startsWith("https://")
    ) {
      url = "https://" + url;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      cache: "no-store",
    });

    // Website blocks our server
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
     * --------------------------------
     * 1. Open Graph
     * --------------------------------
     */

    let title =
      $('meta[property="og:title"]').attr("content") ||
      "";

    let description =
      $('meta[property="og:description"]').attr("content") ||
      "";

    let image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      "";

    const siteName =
      $('meta[property="og:site_name"]').attr("content") ||
      new URL(url).hostname.replace("www.", "");

    /*
     * --------------------------------
     * 2. Twitter metadata
     * --------------------------------
     */

    if (!title) {
      title =
        $('meta[name="twitter:title"]').attr("content") ||
        "";
    }

    if (!description) {
      description =
        $('meta[name="twitter:description"]').attr(
          "content"
        ) || "";
    }

    if (!image) {
      image =
        $('meta[name="twitter:image"]').attr("content") ||
        $('meta[name="twitter:image:src"]').attr(
          "content"
        ) ||
        "";
    }

    /*
     * --------------------------------
     * 3. JSON-LD Product
     * --------------------------------
     */

    let product: Record<string, unknown> | null = null;

    $('script[type="application/ld+json"]').each(
      (_, element) => {
        if (product) {
          return;
        }

        try {
          const json = JSON.parse(
            $(element).html() || ""
          );

          product = findProduct(json);
        } catch {
          // Ignore invalid JSON-LD
        }
      }
    );

    if (product) {
      if (!title && typeof product.name === "string") {
        title = product.name;
      }

      if (
        !description &&
        typeof product.description === "string"
      ) {
        description = product.description;
      }

      if (!image) {
        image = getImage(product.image, url);
      }
    }

    /*
     * --------------------------------
     * 4. Standard HTML metadata
     * --------------------------------
     */

    if (!title) {
      title = $("title").first().text().trim();
    }

    if (!description) {
      description =
        $('meta[name="description"]').attr("content") ||
        "";
    }

    /*
     * --------------------------------
     * 5. Microdata Product
     * --------------------------------
     */

    if (!title) {
      title =
        $('[itemprop="name"]').first().attr("content") ||
        $('[itemprop="name"]').first().text().trim() ||
        "";
    }

    if (!description) {
      description =
        $('[itemprop="description"]')
          .first()
          .attr("content") ||
        $('[itemprop="description"]')
          .first()
          .text()
          .trim() ||
        "";
    }

    if (!image) {
      const microdataImage =
        $('[itemprop="image"]')
          .first()
          .attr("content") ||
        $('[itemprop="image"]')
          .first()
          .attr("src") ||
        "";

      if (microdataImage) {
        image = microdataImage;
      }
    }

    /*
     * --------------------------------
     * Final cleanup
     * --------------------------------
     */

    if (image) {
      image = absoluteUrl(image, url);
    }

    return NextResponse.json({
      url,
      title: title || "Wishlist Item",
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
