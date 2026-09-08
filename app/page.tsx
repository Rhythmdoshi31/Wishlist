"use client";

import { useEffect, useState } from "react";

type WishlistItem = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export default function Home() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [url, setUrl] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(true);

  // Load wishlist from database
  useEffect(() => {
    async function loadItems() {
      try {
        const response = await fetch("/api/wishlist");

        if (!response.ok) {
          throw new Error("Failed to load wishlist");
        }

        const data: WishlistItem[] = await response.json();
        setItems(data);
      } catch (error) {
        console.error("Load wishlist error:", error);
      } finally {
        setLoadingItems(false);
      }
    }

    loadItems();
  }, []);

  // Add item
  async function addItem() {
    const cleanUrl = url.trim();

    if (!cleanUrl || loading) return;

    setLoading(true);

    let finalUrl = cleanUrl;

    if (
      !finalUrl.startsWith("http://") &&
      !finalUrl.startsWith("https://")
    ) {
      finalUrl = "https://" + finalUrl;
    }

    try {
      // Fetch product information
      const previewResponse = await fetch("/api/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: finalUrl,
        }),
      });

      const preview = await previewResponse.json();

      if (!previewResponse.ok) {
        throw new Error(
          preview.error || "Could not fetch product information"
        );
      }

      // Save product to database
      const response = await fetch("/api/wishlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: preview.url || finalUrl,
          title: preview.title || getDomain(finalUrl),
          description: preview.description || "",
          image: preview.image || "",
          siteName: preview.siteName || getDomain(finalUrl),
        }),
      });

      const newItem: WishlistItem = await response.json();

      if (!response.ok) {
        throw new Error(
          (newItem as unknown as { error?: string }).error ||
            "Could not save item"
        );
      }

      setItems((previous) => [newItem, ...previous]);

      setUrl("");
      setShowAdd(false);
    } catch (error) {
      console.error("Add item error:", error);
      alert("Could not add this item.");
    } finally {
      setLoading(false);
    }
  }

  // Delete item
  async function deleteItem(id: string) {
    try {
      const response = await fetch(`/api/wishlist/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete item");
      }

      setItems((previous) =>
        previous.filter((item) => item.id !== id)
      );
    } catch (error) {
      console.error("Delete item error:", error);
      alert("Could not delete this item.");
    }
  }

  // Save edited item
  async function saveEdit() {
    if (!editing || !editing.url.trim()) return;

    try {
      const response = await fetch(
        `/api/wishlist/${editing.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(editing),
        }
      );

      const updated = await response.json();

      if (!response.ok) {
        throw new Error(
          updated.error || "Could not update item"
        );
      }

      setItems((previous) =>
        previous.map((item) =>
          item.id === updated.id ? updated : item
        )
      );

      setEditing(null);
    } catch (error) {
      console.error("Update item error:", error);
      alert("Could not update this item.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#242424]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#e8e7e3] bg-[#f7f7f5]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">
              Wishlist
            </h1>

            <p className="mt-1 text-sm text-[#85847f]">
              Things worth coming back for.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded-full bg-[#242424] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#3a3a38] active:scale-[0.98]"
          >
            <span className="mr-1">+</span>
            Add item
          </button>
        </div>
      </header>

      {/* Main content */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        {/* Item count */}
        {!loadingItems && items.length > 0 && (
          <div className="mb-6">
            <p className="text-sm text-[#85847f]">
              {items.length}{" "}
              {items.length === 1 ? "item" : "items"}
            </p>
          </div>
        )}

        {/* Loading */}
        {loadingItems ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <p className="text-sm text-[#85847f]">
              Loading your wishlist...
            </p>
          </div>
        ) : items.length === 0 ? (
          /* Empty state */
          <div className="flex min-h-[55vh] items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ecebe7] text-2xl text-[#77756f]">
                ♡
              </div>

              <h2 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">
                Nothing here yet
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#85847f]">
                Save products, clothes, gadgets, or anything else
                you want to remember.
              </p>

              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="mt-6 rounded-full bg-[#242424] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#3a3a38]"
              >
                Add your first item
              </button>
            </div>
          </div>
        ) : (
          /* Wishlist cards */
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <article
                key={item.id}
                className="group overflow-hidden rounded-2xl border border-[#e6e5e1] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.07)]"
              >
                {/* Product image */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <div className="relative flex h-64 items-center justify-center overflow-hidden bg-[#f3f3f0]">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full object-contain p-7 transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl text-[#aaa8a1] shadow-sm">
                        ♡
                      </div>
                    )}
                  </div>
                </a>

                {/* Product information */}
                <div className="p-5">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a09e97]">
                    {item.siteName || getDomain(item.url)}
                  </p>

                  <h2 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-5 text-[#292927]">
                    {item.title}
                  </h2>

                  {item.description && (
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#898780]">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-5 flex items-center gap-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl bg-[#242424] px-3 py-2.5 text-center text-xs font-medium text-white transition hover:bg-[#3a3a38]"
                    >
                      View item
                    </a>

                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="rounded-xl border border-[#e2e1dd] px-3 py-2.5 text-xs font-medium text-[#66645f] transition hover:bg-[#f7f7f5]"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteItem(item.id)}
                      className="rounded-xl border border-[#eee2e0] px-3 py-2.5 text-xs font-medium text-[#a36b65] transition hover:bg-[#fbf3f2]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-5 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-3xl border border-[#e5e4e0] bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                  Add to wishlist
                </h2>

                <p className="mt-1.5 text-sm text-[#8a8881]">
                  Paste a product URL to fetch its details.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setUrl("");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-[#999790] transition hover:bg-[#f4f3f0] hover:text-[#44433f]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-6">
              <label
                htmlFor="product-url"
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#8b8982]"
              >
                Product URL
              </label>

              <input
                id="product-url"
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addItem();
                  }
                }}
                placeholder="https://example.com/product"
                className="w-full rounded-2xl border border-[#deddd8] bg-[#fafaf8] px-4 py-3.5 text-sm outline-none transition placeholder:text-[#aaa8a1] focus:border-[#9b9992] focus:bg-white focus:ring-4 focus:ring-[#242424]/5"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setUrl("");
                }}
                className="flex-1 rounded-2xl border border-[#e1e0dc] px-4 py-3 text-sm font-medium text-[#66645f] transition hover:bg-[#f7f7f5]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={addItem}
                disabled={!url.trim() || loading}
                className="flex-1 rounded-2xl bg-[#242424] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#3a3a38] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Fetching..." : "Add item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-5 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-3xl border border-[#e5e4e0] bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                  Edit item
                </h2>

                <p className="mt-1.5 text-sm text-[#8a8881]">
                  Update the information for this item.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-[#999790] transition hover:bg-[#f4f3f0]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="edit-title"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#8b8982]"
                >
                  Title
                </label>

                <input
                  id="edit-title"
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      title: e.target.value,
                    })
                  }
                  className="w-full rounded-2xl border border-[#deddd8] bg-[#fafaf8] px-4 py-3 text-sm outline-none focus:border-[#9b9992] focus:bg-white focus:ring-4 focus:ring-[#242424]/5"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-url"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#8b8982]"
                >
                  URL
                </label>

                <input
                  id="edit-url"
                  value={editing.url}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      url: e.target.value,
                    })
                  }
                  className="w-full rounded-2xl border border-[#deddd8] bg-[#fafaf8] px-4 py-3 text-sm outline-none focus:border-[#9b9992] focus:bg-white focus:ring-4 focus:ring-[#242424]/5"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-description"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#8b8982]"
                >
                  Description
                </label>

                <textarea
                  id="edit-description"
                  value={editing.description || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      description: e.target.value,
                    })
                  }
                  className="min-h-24 w-full resize-none rounded-2xl border border-[#deddd8] bg-[#fafaf8] px-4 py-3 text-sm outline-none focus:border-[#9b9992] focus:bg-white focus:ring-4 focus:ring-[#242424]/5"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 rounded-2xl border border-[#e1e0dc] px-4 py-3 text-sm font-medium text-[#66645f] transition hover:bg-[#f7f7f5]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveEdit}
                className="flex-1 rounded-2xl bg-[#242424] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#3a3a38]"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}