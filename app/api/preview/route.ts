import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    let targetUrl = url.trim();

    if (
      !targetUrl.startsWith("http://") &&
      !targetUrl.startsWith("https://")
    ) {
      targetUrl = "https://" + targetUrl;
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "en-US,en;q=0.9",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      console.log(
        "Website returned",
        response.status,
        targetUrl
      );

      return NextResponse.json({
        url: targetUrl,
        title: getDomain(targetUrl),
        description: "",
        image: "",
        siteName: getDomain(targetUrl),
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Open Graph
    const ogTitle =
      $('meta[property="og:title"]')
        .attr("content")
        ?.trim() || "";

    const ogDescription =
      $('meta[property="og:description"]')
        .attr("content")
        ?.trim() || "";

    const ogImage =
      $('meta[property="og:image"]')
        .attr("content")
        ?.trim() || "";

    const ogSiteName =
      $('meta[property="og:site_name"]')
        .attr("content")
        ?.trim() || "";

    // Twitter
    const twitterTitle =
      $('meta[name="twitter:title"]')
        .attr("content")
        ?.trim() || "";

    const twitterDescription =
      $('meta[name="twitter:description"]')
        .attr("content")
        ?.trim() || "";

    const twitterImage =
      $('meta[name="twitter:image"]')
        .attr("content")
        ?.trim() || "";

    // Normal HTML
    const htmlTitle =
      $("title").first().text().trim() || "";

    const metaDescription =
      $('meta[name="description"]')
        .attr("content")
        ?.trim() || "";

    const title =
      ogTitle ||
      twitterTitle ||
      htmlTitle ||
      getDomain(targetUrl);

    const description =
      ogDescription ||
      twitterDescription ||
      metaDescription ||
      "";

    const image =
      ogImage ||
      twitterImage ||
      "";

    const siteName =
      ogSiteName ||
      getDomain(targetUrl);

    console.log("Preview extracted:", {
      title,
      description,
      image,
      siteName,
    });

    return NextResponse.json({
      url: targetUrl,
      title,
      description,
      image,
      siteName,
    });
  } catch (error) {
    console.error("Preview error:", error);

    return NextResponse.json(
      { error: "Failed to fetch preview" },
      { status: 500 }
    );
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(
      /^www\./,
      ""
    );
  } catch {
    return url;
  }
}
