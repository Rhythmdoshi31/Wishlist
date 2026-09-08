import { NextRequest, NextResponse } from "next/server";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inputUrl = body.url;

    if (!inputUrl || typeof inputUrl !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    let targetUrl = inputUrl.trim();

    if (
      !targetUrl.startsWith("http://") &&
      !targetUrl.startsWith("https://")
    ) {
      targetUrl = "https://" + targetUrl;
    }

    const domain = getDomain(targetUrl);

    console.log("Preview request:", targetUrl);

    const microlinkUrl =
      `https://api.microlink.io/?url=${encodeURIComponent(
        targetUrl
      )}`;

    const response = await fetch(microlinkUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "Microlink error:",
        response.status
      );

      return NextResponse.json({
        url: targetUrl,
        title: domain,
        description: "",
        image: "",
        siteName: domain,
      });
    }

    const result = await response.json();

    const data = result?.data;

    const title =
      typeof data?.title === "string"
        ? data.title.trim()
        : "";

    const description =
      typeof data?.description === "string"
        ? data.description.trim()
        : "";

    const image =
      typeof data?.image?.url === "string"
        ? data.image.url
        : typeof data?.image === "string"
          ? data.image
          : "";

    const publisher =
      typeof data?.publisher === "string"
        ? data.publisher.trim()
        : "";

    console.log("Microlink result:", {
      title,
      description,
      image,
      publisher,
    });

    return NextResponse.json({
      url: targetUrl,
      title: title || domain,
      description,
      image,
      siteName: publisher || domain,
    });
  } catch (error) {
    console.error("Preview error:", error);

    return NextResponse.json(
      {
        error: "Failed to generate preview",
      },
      { status: 500 }
    );
  }
}
