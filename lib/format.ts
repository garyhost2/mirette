export const euro = (n: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

/** Seller images come from their own CDNs, which resize on request. */
export const sized = (url: string, width: number) => `${url}${url.includes("?") ? "&" : "?"}width=${width}`;
