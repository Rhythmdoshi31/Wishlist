import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

function absoluteUrl(value: string, pageUrl: string): string {
  if (!value) return "";

  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return "";
  }
}

function getImageFromJsonLd(
  image: unknown,
  pageUrl: string
): string {
  if (typeof image === "string") {
    return absoluteUrl(image, pageUrl);
  }

  if (Array.isArray(image)) {
    for (const item of image) {
      if (typeof item === "string") {
        const result = absoluteUrl(item, pageUrl);

        if (result) {
          return result;
        }
      }

      if (
        typeof item === "object" &&
        item !== null &&
        "url" in item &&
        typeof item.url === "string"
      ) {
        const result = absoluteUrl(item.url, pageUrl);

        if (result) {
          return result;
        }
      }
    }
  }

  if (
    typeof image === "object" &&
    image !== null &&
    "url" in image &&
    typeof image.url === "string"
  ) {
    return absoluteUrl(image.url, pageUrl);
  }

  return "";
}

function findProductJsonLd(
  data: unknown,
  pageUrl: string
): {
  title: string;
  description: string;
  image: string;
} | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findProductJsonLd(item, pageUrl);

      if (result) {
        return result;
      }
    }

    return null;
  }

  if (
    typeof data !== "object" ||
    data === null
  ) {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Handle JSON-LD @graph
  if (Array.isArray(obj["@graph"])) {
    const result = findProductJsonLd(
      obj["@graph"],
      pageUrl
    );

    if (result) {
      return result;
    }
  }

  const type = obj["@type"];

  const isProduct =
    type === "Product" ||
    (Array.isArray(type) && type.includes("Product"));

  if (!isProduct) {
    return null;
  }

  const title =
    typeof obj.name === "string"
      ? obj.name.trim()
      : "";

  const description =
    typeof obj.description === "string"
      ? obj.description.trim()
      : "";

  const image = getImageFromJsonLd(
    obj.image,
    pageUrl
  );

  if (!title && !description && !image) {
    return null;
  }

  return {
    title,
    description,
    image,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inputUrl = body.url;

    if (
      !inputUrl ||
      typeof inputUrl !== "string"
    ) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    let pageUrl: string;

    try {
      pageUrl = new URL(inputUrl).toString();
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    const hostname = new URL(pageUrl).hostname.replace(
      /^www\./,
      ""
    );

    console.log("Preview requested:", pageUrl);

    /*
     * ================================================
     * 1. FETCH PAGE
     * ================================================
     */

    let html = "";

    try {
      const response = await fetch(pageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language":
            "en-US,en;q=0.9",
        },
        redirect: "follow",
        cache: "no-store",
      });

      if (!response.ok) {
        console.log(
          "Preview fetch failed:",
          response.status,
          pageUrl
        );

        return NextResponse.json({
          url: pageUrl,
          title: hostname,
          description: "",
          image: "",
          siteName: hostname,
        });
      }

      html = await response.text();

      console.log(
        "Preview page fetched:",
        html.length,
        "characters"
      );
    } catch (error) {
      console.error(
        "Preview fetch error:",
        error
      );

      return NextResponse.json({
        url: pageUrl,
        title: hostname,
        description: "",
        image: "",
        siteName: hostname,
      });
    }

    /*
     * ================================================
     * 2. LOAD HTML
     * ================================================
     */

    const $ = cheerio.load(html);

    /*
     * ================================================
     * 3. OPEN GRAPH
     * ================================================
     */

    const ogTitle =
      $('meta[property="og:title"]')
        .attr("content")
        ?.trim() || "";

    const ogDescription =
      $('meta[property="og:description"]')
        .attr("content")
        ?.trim() || "";

    const ogImageRaw =
      $('meta[property="og:image"]')
        .attr("content")
        ?.trim() || "";

    const ogImage = absoluteUrl(
      ogImageRaw,
      pageUrl
    );

    const ogSiteName =
      $('meta[property="og:site_name"]')
        .attr("content")
        ?.trim() || "";

    /*
     * ================================================
     * 4. TWITTER CARD
     * ================================================
     */

    const twitterTitle =
      $('meta[name="twitter:title"]')
        .attr("content")
        ?.trim() || "";

    const twitterDescription =
      $('meta[name="twitter:description"]')
        .attr("content")
        ?.trim() || "";

    const twitterImageRaw =
      $('meta[name="twitter:image"]')
        .attr("content")
        ?.trim() || "";

    const twitterImage = absoluteUrl(
      twitterImageRaw,
      pageUrl
    );

    /*
     * ================================================
     * 5. JSON-LD PRODUCT
     * ================================================
     */

    let jsonLdTitle = "";
    let jsonLdDescription = "";
    let jsonLdImage = "";

    $('script[type="application/ld+json"]').each(
      (_, element) => {
        if (
          jsonLdTitle &&
          jsonLdDescription &&
          jsonLdImage
        ) {
          return;
        }

        const text = $(element)
          .text()
          .trim();

        if (!text) {
          return;
        }

        try {
          const parsed: unknown = JSON.parse(text);

          const product = findProductJsonLd(
            parsed,
            pageUrl
          );

          if (product) {
            if (!jsonLdTitle) {
              jsonLdTitle = product.title;
            }

            if (!jsonLdDescription) {
              jsonLdDescription =
                product.description;
            }

            if (!jsonLdImage) {
              jsonLdImage = product.image;
            }
          }
        } catch {
          // Ignore invalid JSON-LD
        }
      }
    );

    /*
     * ================================================
     * 6. NORMAL META DESCRIPTION
     * ================================================
     */

    const metaDescription =
      $('meta[name="description"]')
        .attr("content")
        ?.trim() || "";

    /*
     * ================================================
     * 7. HTML TITLE
     * ================================================
     */

    const htmlTitle =
      $("title")
        .first()
        .text()
        .trim() || "";

    /*
     * ================================================
     * 8. MICRODATA
     * ================================================
     */

    const microdataTitle =
      $('[itemprop="name"]')
        .first()
        .text()
        .trim() ||
      $('[itemprop="name"]')
        .first()
        .attr("content")
        ?.trim() ||
      "";

    const microdataDescription =
      $('[itemprop="description"]')
        .first()
        .text()
        .trim() ||
      $('[itemprop="description"]')
        .first()
        .attr("content")
        ?.trim() ||
      "";

    const microdataImageRaw =
      $('[itemprop="image"]')
        .first()
        .attr("src") ||
      $('[itemprop="image"]')
        .first()
        .attr("content") ||
      "";

    const microdataImage = absoluteUrl(
      microdataImageRaw,
      pageUrl
    );

    /*
     * ================================================
     * 9. FINAL METADATA
     * ================================================
     */

    const title =
      ogTitle ||
      jsonLdTitle ||
      twitterTitle ||
      microdataTitle ||
      htmlTitle ||
      hostname;

    const description =
      ogDescription ||
      jsonLdDescription ||
      twitterDescription ||
      microdataDescription ||
      metaDescription ||
      "";

    const image =
      ogImage ||
      jsonLdImage ||
      twitterImage ||
      microdataImage ||
      "";

    const siteName =
      ogSiteName ||
      hostname;

    const result = {
      url: pageUrl,
      title,
      description,
      image,
      siteName,
    };

    console.log(
      "Preview result:",
      result
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Preview route error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to generate preview",
      },
      { status: 500 }
    );
  }
}
